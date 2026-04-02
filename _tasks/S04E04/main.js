import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, clearLog, extractTokenUsage, verify as verifyUtil } from '../utils/utils.js';
import {
  initTracing,
  withTrace,
  withAgent,
  flush,
  shutdownTracing,
  startGeneration,
  advanceTurn,
} from '../utils/langfuse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  const rootEnvPath = path.join(__dirname, '../../.env');
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}

clearLog(debugLogFilePath);
initTracing('S04E04-Natan');

// --- Load note files ---

const notesDir = path.join(__dirname, 'workspace', 'natan_notes');
const ogłoszenia = readFileSync(path.join(notesDir, 'ogłoszenia.txt'), 'utf-8');
const rozmowy = readFileSync(path.join(notesDir, 'rozmowy.txt'), 'utf-8');
const transakcje = readFileSync(path.join(notesDir, 'transakcje.txt'), 'utf-8');
const helpJson = readFileSync(path.join(__dirname, 'help.json'), 'utf-8');

// --- Parse agent files ---

function parseAgent(agentName) {
  const filePath = path.join(__dirname, 'agents', `${agentName}.agent.md`);
  if (!existsSync(filePath)) throw new Error(`Agent file not found: ${agentName}`);

  const raw = readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Invalid agent format: ${agentName}`);

  const frontmatter = match[1];
  const systemPrompt = match[2].trim();

  const modelMatch = frontmatter.match(/model:\s*(.*)/);
  const toolsMatch = frontmatter.match(/tools:\n([\s\S]*?)(?=\n\w+:|$)/);

  const model = modelMatch ? modelMatch[1].trim() : 'openai/gpt-5-mini';
  const toolNames = toolsMatch
    ? toolsMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
    : [];

  return { name: agentName, model, toolNames, systemPrompt };
}

// --- Verify tool ---

const verifyTool = {
  type: 'function',
  name: 'verify',
  description: 'Call the filesystem API. Pass an array of actions for batch mode, or a single action object.',
  parameters: {
    type: 'object',
    properties: {
      answer: {
        description: 'A single action object (e.g. {"action":"done"}) or an array of action objects for batch mode.'
      }
    },
    required: ['answer']
  }
};

const toolHandlers = {
  verify: async ({ answer }) => {
    log(`API call: ${JSON.stringify(answer).slice(0, 200)}`, 'tool', false, debugLogFilePath);
    const res = await verifyUtil('filesystem', answer);
    const data = await res.json();
    log(`API response: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
    return JSON.stringify(data);
  }
};

// --- Sub-agent runner (single-shot, no tools) ---

async function runSubAgent(agentName, userMessage) {
  const agent = parseAgent(agentName);
  log(`Starting sub-agent: ${agentName}`, 'agent', false, debugLogFilePath);

  return withAgent({ name: agentName, agentId: `${agentName}-${Date.now()}`, task: userMessage }, async () => {
    advanceTurn();
    const input = [{ role: 'user', content: userMessage }];
    const generation = startGeneration({ model: agent.model, input });
    try {
      const data = await chat({ model: agent.model, input, instructions: agent.systemPrompt });
      const usage = extractTokenUsage(data);
      generation.end({ output: data, usage });
      const text = extractText(data);
      log(`Sub-agent ${agentName} result: ${text}`, 'agent', false, debugLogFilePath);
      return text;
    } catch (error) {
      generation.error(error);
      throw error;
    }
  });
}

// --- Organizer agent runner (multi-step, with verify tool) ---

async function runOrganizer(userMessage) {
  const agent = parseAgent('organizer');
  const systemPrompt = `${agent.systemPrompt}\n\n--- API REFERENCE ---\n\n${helpJson}`;
  const agentTools = agent.toolNames.includes('verify') ? [verifyTool] : [];
  const maxSteps = 20;

  log('Starting organizer agent', 'agent', false, debugLogFilePath);

  let conversation = [{ role: 'user', content: userMessage }];

  return withAgent({ name: 'organizer', agentId: `organizer-${Date.now()}`, task: userMessage }, async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`--- Organizer step ${step + 1}/${maxSteps} ---`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model: agent.model, input: conversation });

      try {
        const data = await chat({
          model: agent.model,
          input: conversation,
          tools: agentTools,
          instructions: systemPrompt,
        });

        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`Organizer: ${text}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: 'assistant', content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          log(`Organizer requested ${toolCalls.length} tool call(s).`, 'agent', false, debugLogFilePath);
          const toolResults = [];
          for (const call of toolCalls) {
            let args = {};
            try {
              args = call.arguments ? JSON.parse(call.arguments) : {};
            } catch (e) {
              toolResults.push({
                type: 'function_call_output',
                call_id: call.call_id,
                output: JSON.stringify({ error: `Invalid JSON in arguments: ${e.message}` }),
              });
              continue;
            }
            const handler = toolHandlers[call.name];
            const output = handler
              ? await handler(args)
              : JSON.stringify({ error: `Unknown tool: ${call.name}` });
            toolResults.push({ type: 'function_call_output', call_id: call.call_id, output });
          }
          conversation = [...conversation, ...toolCalls.map(c => ({ ...c })), ...toolResults];
        } else {
          if (text) return text;
        }
      } catch (error) {
        generation.error(error);
        log(`Organizer error: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
    return 'Max steps exceeded';
  });
}

// --- Main ---

async function main() {
  try {
    const sessionId = `s04e04-${Date.now()}`;
    const result = await withTrace({ name: 'S04E04 Natan', sessionId }, async () => {
      log('Running extraction sub-agents in parallel...', 'agent', false, debugLogFilePath);

      const [citiesData, personsData, goodsData] = await Promise.all([
        runSubAgent('cities', ogłoszenia),
        runSubAgent('persons', rozmowy),
        runSubAgent('goods', transakcje),
      ]);

      const organizerInput = [
        'City needs (from bulletin):',
        citiesData,
        '',
        'Persons per city (from conversations):',
        personsData,
        '',
        'Goods and selling cities (from transactions):',
        goodsData,
      ].join('\n');

      return runOrganizer(organizerInput);
    });

    console.log(`\nFinal Result:\n${result}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
  } finally {
    await flush();
    await shutdownTracing();
  }
}

main();

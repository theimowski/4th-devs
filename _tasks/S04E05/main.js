import path from 'node:path';
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
import {
  operatorToolDefs,
  dbReaderToolDefs,
  makeOperatorHandlers,
  makeDbReaderHandlers,
} from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');
const workspaceDbDir = path.join(__dirname, 'workspace', 'db');

const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  const rootEnvPath = path.join(__dirname, '../../.env');
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}

clearLog(debugLogFilePath);
initTracing('S04E05');

const helpJson = readFileSync(path.join(__dirname, 'help.json'), 'utf-8');
const food4citiesJson = readFileSync(path.join(__dirname, 'food4cities.json'), 'utf-8');

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

// --- Generic agentic loop ---

async function runAgentLoop({ agentName, model, systemPrompt, toolDefs, handlers, userMessage, maxSteps }) {
  log(`Starting agent: ${agentName}`, 'agent', false, debugLogFilePath);
  let conversation = [{ role: 'user', content: userMessage }];

  return withAgent({ name: agentName, agentId: `${agentName}-${Date.now()}`, task: userMessage }, async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`--- ${agentName} step ${step + 1}/${maxSteps} ---`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model, input: conversation });

      try {
        const data = await chat({ model, input: conversation, tools: toolDefs, instructions: systemPrompt });
        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`${agentName}: ${text.slice(0, 300)}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: 'assistant', content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          log(`${agentName} requested ${toolCalls.length} tool call(s)`, 'agent', false, debugLogFilePath);
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
            const handler = handlers[call.name];
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
        log(`${agentName} error: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
    return `Max steps (${maxSteps}) exceeded`;
  });
}

// --- Agent runners ---

async function runDbReader(message) {
  const agent = parseAgent('dbreader');
  const handlers = makeDbReaderHandlers(verifyUtil, workspaceDbDir, log, debugLogFilePath);
  return runAgentLoop({
    agentName: 'dbreader',
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    toolDefs: dbReaderToolDefs,
    handlers,
    userMessage: message,
    maxSteps: 50,
  });
}

async function runOperator() {
  const agent = parseAgent('operator');
  const systemPrompt = [
    agent.systemPrompt,
    '\n--- FOOD4CITIES ---',
    food4citiesJson,
    '\n--- API REFERENCE ---',
    helpJson,
  ].join('\n');
  const handlers = makeOperatorHandlers(runDbReader, verifyUtil, log, debugLogFilePath);
  return runAgentLoop({
    agentName: 'operator',
    model: agent.model,
    systemPrompt,
    toolDefs: operatorToolDefs,
    handlers,
    userMessage: 'Execute the foodwarehouse task: read the database, create all required orders, and call done.',
    maxSteps: 50,
  });
}

// --- Main ---

async function main() {
  try {
    const sessionId = `s04e05-${Date.now()}`;
    const result = await withTrace({ name: 'S04E05 Foodwarehouse', sessionId }, async () => {
      return runOperator();
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

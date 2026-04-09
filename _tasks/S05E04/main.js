import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, clearLog, extractTokenUsage, verify, hubApi, hubApiGet } from '../utils/utils.js';
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
  rockerToolDefs,
  radiomanToolDefs,
  makeOperatorHandlers,
  makeRockerHandlers,
  makeRadiomanHandlers,
} from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

// --- Load env ---

const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  const rootEnvPath = path.join(__dirname, '../../.env');
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}

clearLog(debugLogFilePath);
initTracing('S05E04');

// --- Parse agent file ---

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
  const model = modelMatch ? modelMatch[1].trim() : 'openai/gpt-4o-mini';
  const toolNames = toolsMatch
    ? toolsMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
    : [];
  return { name: agentName, model, toolNames, systemPrompt };
}

// --- Tool registry ---

const allToolDefs = {
  operator: operatorToolDefs,
  rocker: rockerToolDefs,
  radioman: radiomanToolDefs,
};

// --- Generic agentic loop ---

async function runAgentLoop({ agentName, model, systemPrompt, toolDefs, handlers, userMessage, maxSteps = 50 }) {
  log(`Starting agent: ${agentName}`, agentName, false, debugLogFilePath);
  let conversation = [{ role: 'user', content: userMessage }];

  return withAgent({ name: agentName, agentId: `${agentName}-${Date.now()}`, task: userMessage }, async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`--- ${agentName} step ${step + 1}/${maxSteps} ---`, agentName, false, debugLogFilePath);

      const generation = startGeneration({ model, input: conversation });

      try {
        const data = await chat({
          model,
          input: conversation,
          tools: toolDefs.length > 0 ? toolDefs : undefined,
          instructions: systemPrompt,
        });
        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`${agentName}: ${text.slice(0, 300)}`, agentName, false, debugLogFilePath);
          conversation.push({ role: 'assistant', content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          log(`${agentName} requested ${toolCalls.length} tool call(s)`, agentName, false, debugLogFilePath);
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

// --- Run agent by name ---

export async function runAgent(agentName, userMessage, depth = 0) {
  if (depth > 5) return 'Error: Max delegation depth exceeded';

  const agent = parseAgent(agentName);
  const allDefs = allToolDefs[agentName] ?? [];
  const toolDefs = allDefs.filter(t => agent.toolNames.includes(t.name));
  const runAgentFn = (subAgent, task) => runAgent(subAgent, task, depth + 1);

  const handlers =
    agentName === 'operator' ? makeOperatorHandlers(runAgentFn, verify, log, debugLogFilePath) :
    agentName === 'rocker'   ? makeRockerHandlers(hubApi, log, debugLogFilePath) :
                               makeRadiomanHandlers(hubApiGet, hubApi, log, debugLogFilePath);

  const maxSteps = agentName === 'operator' ? 100 : 30;

  return runAgentLoop({
    agentName: agent.name,
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    toolDefs,
    handlers,
    userMessage,
    maxSteps,
  });
}

// --- Main ---

async function main() {
  const sessionId = `s05e04-${Date.now()}`;
  log(`Session: ${sessionId}`, 'info', false, debugLogFilePath);

  try {
    const result = await withTrace({ name: 'S05E04 goingthere', sessionId }, async () => {
      return runAgent('operator', 'Start the game and navigate the rocket to Grudziądz. Follow the procedure: for each step, check radar (radioman), get rock hint (rocker), then move.');
    });
    console.log('\nFinal Result:', result);
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await flush();
    await shutdownTracing();
  }
}

main();

import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, clearLog, extractTokenUsage } from '../utils/utils.js';
import { 
  initTracing, 
  withTrace, 
  withAgent, 
  startGeneration, 
  advanceTurn, 
  flush, 
  shutdownTracing 
} from './langfuse.js';
import { MODEL, SYSTEM_PROMPT, TRACE_NAME, AGENT_TASK } from './config.js';
import { tools, handlers } from './tools.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');
const envPath = path.join(__dirname, '.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

clearLog(debugLogFilePath);
initTracing('S03E02-Hacker');

const MAX_STEPS = 5;

async function runHacker() {
  let conversation = [
    { role: 'user', content: 'Explore the system and check if /opt/firmware/cooler/cooler.bin exists. Start with help command.' }
  ];

  return withAgent({ name: 'hacker', agentId: 'hacker-1', task: AGENT_TASK }, async () => {
    for (let step = 0; step < MAX_STEPS; step++) {
      advanceTurn();
      log(`Step ${step + 1}/${MAX_STEPS}`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model: MODEL, input: conversation });
      
      try {
        const data = await chat({
          model: MODEL,
          input: conversation,
          tools: tools,
          instructions: SYSTEM_PROMPT
        });

        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`Assistant: ${text}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: "assistant", content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          const toolResults = [];
          for (const call of toolCalls) {
            const handler = handlers[call.name];
            if (handler) {
              const args = JSON.parse(call.arguments);
              const output = await handler(args);
              toolResults.push({ type: "function_call_output", call_id: call.call_id, output });
            } else {
              toolResults.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: `Unknown tool: ${call.name}` }) });
            }
          }
          
          conversation = [
            ...conversation,
            ...toolCalls.map(c => ({ ...c })),
            ...toolResults
          ];
        } else {
          if (text) return text;
        }
      } catch (error) {
        generation.error(error);
        log(`Error: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
    return "Max steps exceeded";
  });
}

async function main() {
  try {
    const sessionId = `hacker-${Date.now()}`;
    const result = await withTrace({ name: TRACE_NAME, sessionId }, async () => {
      return runHacker();
    });
    console.log(`\nFinal Result: ${result}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
  } finally {
    await flush();
    await shutdownTracing();
  }
}

main();

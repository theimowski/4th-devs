import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, clearLog, extractTokenUsage } from '../utils/utils.js';
import {
  initTracing,
  withTrace,
  withAgent,
  startGeneration,
  advanceTurn,
  flush,
  shutdownTracing,
} from '../utils/langfuse.js';
import { MODEL, SYSTEM_PROMPT, INITIAL_TASK } from './config.js';
import { toolDefs, makeToolHandlers } from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

clearLog(debugLogFilePath);
initTracing('S05E05');

async function runMission() {
  const handlers = makeToolHandlers(log, debugLogFilePath);
  let conversation = [{ role: 'user', content: INITIAL_TASK }];

  await withAgent({ name: 'ChronosAssistant', agentId: `chronos-${Date.now()}`, task: INITIAL_TASK }, async () => {
    const maxSteps = 100;

    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`--- Step ${step + 1}/${maxSteps} ---`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model: MODEL, input: conversation });

      try {
        const data = await chat({
          model: MODEL,
          input: conversation,
          tools: toolDefs,
          instructions: SYSTEM_PROMPT,
        });
        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`Agent: ${text.slice(0, 400)}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: 'assistant', content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          log(`Tool calls: ${toolCalls.map((c) => c.name).join(', ')}`, 'agent', false, debugLogFilePath);
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

            log(`${call.name} → ${String(output).slice(0, 300)}`, 'tool', false, debugLogFilePath);
            toolResults.push({ type: 'function_call_output', call_id: call.call_id, output });
          }

          conversation = [...conversation, ...toolCalls.map((c) => ({ ...c })), ...toolResults];
        } else {
          // No tool calls — agent is done
          if (text) {
            console.log(`\n[AGENT] ${text}\n`);
          }
          break;
        }
      } catch (error) {
        generation.error(error);
        log(`Error: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
  });
}

async function main() {
  await withTrace({ name: 'S05E05-timetravel' }, async () => {
    await runMission();
  });

  await flush();
  await shutdownTracing();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

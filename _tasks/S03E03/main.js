import { log, clearLog } from '../utils/utils.js';
import { 
  initTracing, 
  withTrace, 
  withAgent, 
  flush, 
  shutdownTracing 
} from '../utils/langfuse.js';
import { MODEL, SYSTEM_PROMPT, TRACE_NAME, AGENT_TASK, MAX_STEPS, USER_MESSAGE } from './config.js';
import { runAgent } from './loop.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');
const envPath = path.join(__dirname, '.env');
const boardPath = path.join(__dirname, 'board.json');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

clearLog(debugLogFilePath);
initTracing('S03E03-GameAnalyst');

async function main() {
  try {
    const boardData = existsSync(boardPath) ? readFileSync(boardPath, 'utf8') : '{}';
    const finalSystemPrompt = `${SYSTEM_PROMPT}\n\nBOARD DATA:\n${boardData}`;
    
    const sessionId = `game-${Date.now()}`;
    const result = await withTrace({ name: TRACE_NAME, sessionId }, async () => {
      return runAgent({
        model: MODEL,
        systemPrompt: finalSystemPrompt,
        userMessage: USER_MESSAGE,
        maxSteps: MAX_STEPS,
        debugLogFilePath,
        agentName: 'game-analyst',
        agentId: 'analyst-1',
        agentTask: AGENT_TASK,
        withAgentWrapper: withAgent
      });
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

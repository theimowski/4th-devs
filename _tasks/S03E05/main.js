import { log, clearLog } from '../utils/utils.js';
import { 
  initTracing, 
  withTrace, 
  withAgent, 
  flush, 
  shutdownTracing 
} from '../utils/langfuse.js';
import { MODEL, SYSTEM_PROMPT, TRACE_NAME, AGENT_TASK, MAX_STEPS, USER_MESSAGE } from './config.js';
import { runAgent } from '../utils/agent.js';
import { tools, handlers } from './tools.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

// Load environment variables from .env file in the task directory
const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  // If not in task directory, maybe it's in the project root
  const rootEnvPath = path.join(__dirname, '../../.env');
  if (existsSync(rootEnvPath)) {
    process.loadEnvFile(rootEnvPath);
  }
}

clearLog(debugLogFilePath);
initTracing('S03E05-Explorer');

async function main() {
  try {
    const sessionId = `explore-${Date.now()}`;
    const result = await withTrace({ name: TRACE_NAME, sessionId }, async () => {
      return runAgent({
        model: MODEL,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: USER_MESSAGE,
        maxSteps: MAX_STEPS,
        tools,
        handlers,
        debugLogFilePath,
        agentName: 'explorer',
        agentId: 'explorer-1',
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

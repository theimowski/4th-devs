import { verify, log } from '../utils/utils.js';
import { withTool } from '../utils/langfuse.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

export const tools = [{
  type: 'function',
  name: 'action',
  description: 'Perform an action in the game.',
  parameters: {
    type: 'object',
    properties: {
      command: { 
        type: 'string', 
        description: 'The action to perform: start, restart, left, right, wait',
        enum: ['start', 'restart', 'left', 'right', 'wait']
      }
    },
    required: ['command']
  }
}];

export const handlers = {
  action: async ({ command }) => {
    return withTool({ name: 'action', input: { command } }, async () => {
      log(`Performing action: ${command}`, 'tool', false, debugLogFilePath);
      try {
        const response = await verify('reactor', { command });
        const data = await response.json();
        log(`Action result: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
        return JSON.stringify(data);
      } catch (error) {
        log(`Action failed: ${error.message}`, 'error', false, debugLogFilePath);
        return JSON.stringify({ error: error.message });
      }
    });
  }
};

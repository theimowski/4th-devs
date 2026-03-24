import { hubApi, log } from '../utils/utils.js';
import { withTool } from './langfuse.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

export const tools = [{
  type: 'function',
  name: 'shell_cmd',
  description: 'Execute a shell command in the VM.',
  parameters: {
    type: 'object',
    properties: {
      cmd: { type: 'string', description: 'The command to execute' }
    },
    required: ['cmd']
  }
}];

export const handlers = {
  shell_cmd: async ({ cmd }) => {
    return withTool({ name: 'shell_cmd', input: { cmd } }, async () => {
      log(`Executing shell command: ${cmd}`, 'tool', false, debugLogFilePath);
      try {
        const response = await hubApi('shell', { cmd });
        const data = await response.json();
        log(`Shell output: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
        return JSON.stringify(data);
      } catch (error) {
        log(`Shell command failed: ${error.message}`, 'error', false, debugLogFilePath);
        return JSON.stringify({ error: error.message });
      }
    });
  }
};

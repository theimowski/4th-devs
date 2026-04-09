import { hubApi, verify, log } from '../utils/utils.js';
import { withTool } from '../utils/langfuse.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');
const MAX_OUTPUT_LENGTH = 1000;

export const tools = [{
  type: 'function',
  name: 'shell_cmd',
  description: 'Execute a shell command on the remote server. Output is truncated to 1000 characters — use head/tail/grep to keep output small.',
  parameters: {
    type: 'object',
    properties: {
      cmd: { type: 'string', description: 'The shell command to execute' }
    },
    required: ['cmd']
  }
}];

export const handlers = {
  shell_cmd: async ({ cmd }) => {
    return withTool({ name: 'shell_cmd', input: { cmd } }, async () => {
      log(`Executing shell command: ${cmd}`, 'tool', false, debugLogFilePath);
      try {
        const response = await verify('shellaccess', { cmd });
        const data = await response.json();
        const raw = JSON.stringify(data);
        const output = raw.length > MAX_OUTPUT_LENGTH
          ? raw.substring(0, MAX_OUTPUT_LENGTH) + '...[truncated]'
          : raw;
        log(`Shell output: ${output}`, 'tool', false, debugLogFilePath);
        return output;
      } catch (error) {
        log(`Shell command failed: ${error.message}`, 'error', false, debugLogFilePath);
        return JSON.stringify({ error: error.message });
      }
    });
  }
};

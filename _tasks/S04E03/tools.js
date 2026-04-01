import { log } from '../utils/utils.js';
import { withTool } from '../utils/langfuse.js';
import { verify as verifyUtil } from '../utils/utils.js';

export const domatowoTools = [
  {
    type: 'function',
    name: 'verify',
    description: 'Call the Domatowo API with an action. Pass the full answer object containing the action name and any required parameters.',
    parameters: {
      type: 'object',
      properties: {
        answer: {
          type: 'object',
          description: 'The answer object to send to the API (e.g. { "action": "getMap" } or { "action": "create", "type": "transporter", "passengers": 2 })'
        }
      },
      required: ['answer']
    }
  }
];

export function createDomatowoHandlers(debugLogFilePath) {
  return {
    verify: async ({ answer }) => {
      return withTool({ name: 'verify', input: answer }, async () => {
        log(`API call: ${JSON.stringify(answer)}`, 'tool', false, debugLogFilePath);
        const res = await verifyUtil('domatowo', answer);
        const data = await res.json();
        log(`API response: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
        return JSON.stringify(data);
      });
    }
  };
}

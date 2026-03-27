import { hubApi, log } from '../utils/utils.js';
import { withTool } from '../utils/langfuse.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

export const baseTools = [
  {
    type: 'function',
    name: 'tool_search',
    description: 'Search for available tools on the hub.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to find tools.'
        }
      },
      required: ['query']
    }
  },
  {
    type: 'function',
    name: 'delegate',
    description: 'Delegate a task to a sub-agent.',
    parameters: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'The name of the agent to delegate to (e.g., toolshed).',
          enum: ['toolshed']
        },
        task: {
          type: 'string',
          description: 'The task description for the sub-agent.'
        }
      },
      required: ['agent', 'task']
    }
  },
  {
    type: 'function',
    name: 'verify',
    description: 'Verify the final answer (path/moves).',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'The task name (e.g., "savethem").'
        },
        answer: {
          type: 'array',
          items: { type: 'string' },
          description: 'The JSON string array of moves and vehicle choices.'
        }
      },
      required: ['task', 'answer']
    }
  }
];

export function createNativeHandlers(agentName, runAgentFn) {
  return {
    tool_search: async ({ query }) => {
      return withTool({ name: 'tool_search', input: { query } }, async () => {
        log(`Searching for tool with query: ${query}`, 'tool', false, debugLogFilePath);
        try {
          const response = await hubApi('toolsearch', { query });
          const data = await response.json();
          log(`Search result: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
          return JSON.stringify(data);
        } catch (error) {
          log(`Search failed: ${error.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: error.message });
        }
      });
    },
    delegate: async ({ agent, task }) => {
      // runAgentFn is a reference to runAgent in main.js
      log(`Delegating to ${agent}: ${task}`, 'tool', false, debugLogFilePath);
      const result = await runAgentFn(agent, task);
      return result;
    },
    verify: async ({ task, answer }) => {
      return withTool({ name: 'verify', input: { task, answer } }, async () => {
        log(`Verifying task "${task}" with answer: ${JSON.stringify(answer)}`, 'tool', false, debugLogFilePath);
        try {
          const { verify: verifyApi } = await import('../utils/utils.js');
          const response = await verifyApi(task, answer);
          const data = await response.json();
          log(`Verification result: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
          return JSON.stringify(data);
        } catch (error) {
          log(`Verification failed: ${error.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: error.message });
        }
      });
    }
  };
}

export function createHubToolHandler(toolName) {
  return async (params) => {
    return withTool({ name: toolName, input: params }, async () => {
      log(`Calling tool "${toolName}" with params: ${JSON.stringify(params)}`, 'tool', false, debugLogFilePath);
      try {
        const response = await hubApi(toolName, params);
        const data = await response.json();
        log(`Tool "${toolName}" result: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
        return JSON.stringify(data);
      } catch (error) {
        log(`Tool "${toolName}" failed: ${error.message}`, 'error', false, debugLogFilePath);
        return JSON.stringify({ error: error.message });
      }
    });
  };
}

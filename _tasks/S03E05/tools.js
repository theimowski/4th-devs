import { hubApi, log } from '../utils/utils.js';
import { withTool } from '../utils/langfuse.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

export const tools = [
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
    name: 'tool_call',
    description: 'Call a tool with a specific query.',
    parameters: {
      type: 'object',
      properties: {
        tool: {
          type: 'string',
          description: 'The name of the tool to call. This must come from the tool_search results - use "name", not "url".'
        },
        query: {
          type: 'string',
          description: 'The query or parameters for the tool call.'
        }
      },
      required: ['tool', 'query']
    }
  }
];

export const handlers = {
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
  tool_call: async ({ tool, query }) => {
    return withTool({ name: 'tool_call', input: { tool, query } }, async () => {
      log(`Calling tool "${tool}" with query: ${query}`, 'tool', false, debugLogFilePath);
      try {
        const response = await hubApi(tool, { query });
        const data = await response.json();
        log(`Tool call result: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
        return JSON.stringify(data);
      } catch (error) {
        log(`Tool call failed: ${error.message}`, 'error', false, debugLogFilePath);
        return JSON.stringify({ error: error.message });
      }
    });
  }
};

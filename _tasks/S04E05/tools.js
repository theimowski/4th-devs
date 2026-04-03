import path from 'node:path';
import fs from 'node:fs';

// --- Operator tool definitions ---

export const operatorToolDefs = [
  {
    type: 'function',
    name: 'verify',
    description: 'Call the foodwarehouse API. Pass the answer object as documented in the API reference.',
    parameters: {
      type: 'object',
      properties: {
        answer: {
          description: 'API action object, e.g. { tool: "orders", action: "get" } or { tool: "done" }'
        }
      },
      required: ['answer']
    }
  },
  {
    type: 'function',
    name: 'delegate',
    description: 'Delegate a task to a sub-agent. Use agent "dbreader" to query the SQLite database.',
    parameters: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Sub-agent name. Only "dbreader" is available.'
        },
        message: {
          type: 'string',
          description: 'Task description with specific queries to run, including exact SQL and desired output format.'
        }
      },
      required: ['agent', 'message']
    }
  }
];

// --- dbreader tool definitions ---

export const dbReaderToolDefs = [
  {
    type: 'function',
    name: 'sqlite',
    description: 'Execute a read-only query against the task SQLite database.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'SQL or meta-command: SELECT ..., SHOW TABLES, SHOW CREATE TABLE <name>, .tables, .schema, .schema <name>'
        }
      },
      required: ['query']
    }
  },
  {
    type: 'function',
    name: 'readFile',
    description: 'Read a cached schema file from workspace/db/. Returns FILE_NOT_FOUND if missing.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Filename in workspace/db/, e.g. "tables.md" or "users.md"'
        }
      },
      required: ['filename']
    }
  },
  {
    type: 'function',
    name: 'writeFile',
    description: 'Write a file to workspace/db/ for caching schema or query results.',
    parameters: {
      type: 'object',
      properties: {
        filename: {
          type: 'string',
          description: 'Filename in workspace/db/'
        },
        content: {
          type: 'string',
          description: 'Content to write'
        }
      },
      required: ['filename', 'content']
    }
  }
];

// --- Operator handler factory ---

export function makeOperatorHandlers(runDbReader, verifyUtil, log, debugLogFilePath) {
  return {
    verify: async ({ answer }) => {
      log(`[operator] verify: ${JSON.stringify(answer).slice(0, 200)}`, 'tool', false, debugLogFilePath);
      const res = await verifyUtil('foodwarehouse', answer);
      const data = await res.json();
      log(`[operator] verify response: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
      return JSON.stringify(data);
    },
    delegate: async ({ agent, message }) => {
      log(`[operator] delegate → ${agent}: ${message.slice(0, 100)}`, 'tool', false, debugLogFilePath);
      if (agent !== 'dbreader') {
        return JSON.stringify({ error: `Unknown agent: ${agent}. Only "dbreader" is available.` });
      }
      const result = await runDbReader(message);
      log(`[operator] delegate ← ${agent}: ${String(result).slice(0, 200)}`, 'tool', false, debugLogFilePath);
      return result;
    }
  };
}

// --- dbreader handler factory ---

export function makeDbReaderHandlers(verifyUtil, workspaceDbDir, log, debugLogFilePath) {
  fs.mkdirSync(workspaceDbDir, { recursive: true });

  return {
    sqlite: async ({ query }) => {
      log(`[dbreader] sqlite: ${query}`, 'tool', false, debugLogFilePath);
      const res = await verifyUtil('foodwarehouse', { tool: 'database', query });
      const data = await res.json();
      log(`[dbreader] sqlite response: ${JSON.stringify(data).slice(0, 300)}`, 'tool', false, debugLogFilePath);
      return JSON.stringify(data);
    },
    readFile: async ({ filename }) => {
      const filePath = path.join(workspaceDbDir, filename);
      if (!fs.existsSync(filePath)) {
        return 'FILE_NOT_FOUND';
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      log(`[dbreader] readFile: ${filename} (${content.length} chars)`, 'tool', false, debugLogFilePath);
      return content;
    },
    writeFile: async ({ filename, content }) => {
      const filePath = path.join(workspaceDbDir, filename);
      fs.writeFileSync(filePath, content, 'utf-8');
      log(`[dbreader] writeFile: ${filename} (${content.length} chars)`, 'tool', false, debugLogFilePath);
      return `OK: written ${content.length} chars to ${filename}`;
    }
  };
}

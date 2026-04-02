import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, clearLog, extractTokenUsage } from '../utils/utils.js';
import {
  initTracing,
  withTrace,
  withAgent,
  flush,
  shutdownTracing,
  startGeneration,
  advanceTurn,
} from '../utils/langfuse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  const rootEnvPath = path.join(__dirname, '../../.env');
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}

clearLog(debugLogFilePath);
initTracing('S04E04-Natan');

// --- MCP client helpers ---

async function connectMcp() {
  const mcpConfig = JSON.parse(readFileSync(path.join(__dirname, 'mcp.json'), 'utf-8'));
  const clients = {};
  for (const [name, config] of Object.entries(mcpConfig.mcpServers)) {
    const client = new Client({ name: `s04e04-${name}`, version: '1.0.0' }, { capabilities: {} });
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...config.env },
      cwd: __dirname,
      stderr: 'inherit',
    });
    await client.connect(transport);
    clients[name] = client;
  }
  return clients;
}

async function listMcpTools(clients) {
  const tools = [];
  for (const [server, client] of Object.entries(clients)) {
    const { tools: serverTools } = await client.listTools();
    for (const tool of serverTools) {
      tools.push({
        type: 'function',
        name: `${server}__${tool.name}`,
        description: tool.description,
        parameters: tool.inputSchema,
      });
    }
  }
  return tools;
}

async function callMcpTool(clients, prefixedName, args) {
  const [server, ...parts] = prefixedName.split('__');
  const client = clients[server];
  if (!client) throw new Error(`Unknown MCP server: ${server}`);
  const result = await client.callTool({ name: parts.join('__'), arguments: args });
  const text = result.content.find((c) => c.type === 'text');
  if (!text) return result;
  try { return JSON.parse(text.text); } catch { return text.text; }
}

async function closeMcp(clients) {
  for (const client of Object.values(clients)) {
    try { await client.close(); } catch {}
  }
}

// --- Agent ---

const SYSTEM_PROMPT = `You are organizing trade notes into a virtual filesystem.

The notes are in the natan_notes/ directory (accessible via fs tools).
Read all note files first to understand the data, then create the following structure under vfs/:

vfs/miasta/<city_name>   — JSON object: { "<good>": <quantity>, ... }
                           what the city NEEDS; no units; no Polish characters in keys or values
vfs/osoby/<person_name>  — person's full name on first line, then a markdown link to their city file
                           e.g.: Jan Kowalski\n[warszawa](/vfs/miasta/warszawa)
vfs/towary/<good_name>   — markdown link to the city that SELLS/OFFERS this good
                           e.g.: [domatowo](/vfs/miasta/domatowo)
                           good name must be singular nominative, no Polish characters

Rules:
- No Polish characters anywhere (file names, JSON keys, content)
- Replace Polish chars: ą→a, ć→c, ę→e, ł→l, ń→n, ó→o, ś→s, ź/ż→z
- File and directory names: lowercase letters, digits, underscores only
- Create parent directories before files inside them
- For goods sold by multiple cities, create one file per unique good name containing all relevant city links`;

async function runAgent(clients, tools) {
  const maxSteps = 60;
  const model = 'openai/gpt-5.2';
  const userMessage = 'Organize Natan\'s trade notes into the virtual filesystem.';

  let conversation = [{ role: 'user', content: userMessage }];

  const agentLogic = async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`--- Step ${step + 1}/${maxSteps} ---`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model, input: conversation });

      try {
        const data = await chat({
          model,
          input: conversation,
          tools: tools.length > 0 ? tools : undefined,
          instructions: SYSTEM_PROMPT,
        });

        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`Assistant: ${text}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: 'assistant', content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          log(`Requested ${toolCalls.length} tool call(s).`, 'agent', false, debugLogFilePath);
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
            log(`Tool call: ${call.name}(${JSON.stringify(args)})`, 'tool', false, debugLogFilePath);
            const output = await callMcpTool(clients, call.name, args);
            log(`Tool result: ${JSON.stringify(output)}`, 'tool', false, debugLogFilePath);
            toolResults.push({
              type: 'function_call_output',
              call_id: call.call_id,
              output: typeof output === 'string' ? output : JSON.stringify(output),
            });
          }
          conversation = [...conversation, ...toolCalls.map((c) => ({ ...c })), ...toolResults];
        } else {
          if (text) return text;
        }
      } catch (error) {
        generation.error(error);
        log(`Error: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
    return 'Max steps exceeded';
  };

  return withAgent({ name: 'natan-organizer', agentId: `natan-${Date.now()}`, task: userMessage }, agentLogic);
}

async function main() {
  let clients;
  try {
    clients = await connectMcp();
    const tools = await listMcpTools(clients);
    log(`Connected to MCP, ${tools.length} tools available.`, 'agent', false, debugLogFilePath);

    const sessionId = `s04e04-${Date.now()}`;
    const result = await withTrace({ name: 'S04E04 Natan', sessionId }, async () => {
      return runAgent(clients, tools);
    });
    console.log(`\nFinal Result:\n${result}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
  } finally {
    if (clients) await closeMcp(clients);
    await flush();
    await shutdownTracing();
  }
}

main();

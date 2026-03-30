import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, clearLog, extractTokenUsage } from '../utils/utils.js';
import {
  initTracing,
  withTrace,
  withAgent,
  flush,
  shutdownTracing,
  startGeneration,
  advanceTurn
} from '../utils/langfuse.js';
import { launch, close } from './browser.js';
import { operatorTools, crawlerTools, hackerTools, createNativeHandlers, createBrowserHandlers } from './tools.js';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

// Load environment variables
const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  const rootEnvPath = path.join(__dirname, '../../.env');
  if (existsSync(rootEnvPath)) {
    process.loadEnvFile(rootEnvPath);
  }
}

clearLog(debugLogFilePath);
initTracing('S04E01-MultiAgent-OKO');

const hackerApiDoc = fs.readFileSync(
  path.join(__dirname, '../../_tasks/S01E05/help.json'), 'utf8'
);

function parseAgent(agentName) {
  const filePath = path.join(__dirname, 'agents', `${agentName}.agent.md`);
  if (!existsSync(filePath)) throw new Error(`Agent file not found: ${agentName}`);

  const raw = fs.readFileSync(filePath, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Invalid agent format: ${agentName}`);

  const frontmatter = match[1];
  const systemPrompt = match[2].trim();

  const modelMatch = frontmatter.match(/model:\s*(.*)/);
  const toolsMatch = frontmatter.match(/tools:\n([\s\S]*?)(?=\n\w+:|$)/);
  const taskMatch = frontmatter.match(/task:\s*\|\n([\s\S]*?)(?=\n\w+:|$)/);

  const model = modelMatch ? modelMatch[1].trim() : 'openai/gpt-4.1-mini';
  const toolNames = toolsMatch
    ? toolsMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
    : [];
  const task = taskMatch
    ? taskMatch[1].replace(/^  /mg, '').trim().replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? '')
    : null;

  const finalPrompt = agentName === 'hacker'
    ? `${systemPrompt}\n\n## Backdoor API Reference\n\n${hackerApiDoc}`
    : systemPrompt;

  return { name: agentName, model, toolNames, systemPrompt: finalPrompt, task };
}

export async function runAgent(agentName, userMessage, depth = 0) {
  if (depth > 5) return 'Error: Max delegation depth exceeded';

  const agent = parseAgent(agentName);
  const maxSteps = 25;

  log(`Starting agent: ${agentName} (depth: ${depth})`, 'agent', false, debugLogFilePath);

  const toolsByAgent = { operator: operatorTools, crawler: crawlerTools, hacker: hackerTools };
  const allTools = toolsByAgent[agentName] ?? crawlerTools;
  const agentTools = allTools.filter(t => agent.toolNames.includes(t.name));

  const handlers = {
    ...createNativeHandlers(agentName, (subAgent, task) => runAgent(subAgent, task, depth + 1), debugLogFilePath),
    ...createBrowserHandlers(debugLogFilePath)
  };

  let conversation = [
    { role: 'user', content: userMessage }
  ];

  const agentLogic = async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`--- Step ${step + 1}/${maxSteps} for ${agentName} ---`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model: agent.model, input: conversation });

      try {
        const data = await chat({
          model: agent.model,
          input: conversation,
          tools: agentTools.length > 0 ? agentTools : undefined,
          instructions: agent.systemPrompt
        });

        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`Assistant (${agentName}): ${text}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: 'assistant', content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          log(`${agentName} requested ${toolCalls.length} tool call(s).`, 'agent', false, debugLogFilePath);
          const toolResults = [];
          for (const call of toolCalls) {
            const handler = handlers[call.name];
            if (handler) {
              let args = {};
              try {
                args = call.arguments ? JSON.parse(call.arguments) : {};
              } catch (parseError) {
                log(`Failed to parse tool arguments for ${call.name}: ${parseError.message}`, 'error', false, debugLogFilePath);
                toolResults.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error: `Invalid JSON in tool arguments: ${parseError.message}` }) });
                continue;
              }

              const output = await handler(args);
              toolResults.push({ type: 'function_call_output', call_id: call.call_id, output });
            } else {
              toolResults.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error: `Unknown tool: ${call.name}` }) });
            }
          }

          conversation = [
            ...conversation,
            ...toolCalls.map(c => ({ ...c })),
            ...toolResults
          ];
        } else {
          if (text) return text;
        }
      } catch (error) {
        generation.error(error);
        log(`Error in agent ${agentName}: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
    return 'Max steps exceeded';
  };

  return withAgent({ name: agentName, agentId: `${agentName}-${Date.now()}`, task: userMessage }, agentLogic);
}

async function main() {
  await launch(true);
  try {
    const sessionId = `s04e01-${Date.now()}`;
    const result = await withTrace({ name: 'S04E01 OKO Explorer', sessionId }, async () => {
      const operator = parseAgent('operator');
      return runAgent('operator', operator.task);
    });
    console.log(`\nFinal Result:\n${result}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
  } finally {
    await close();
    await flush();
    await shutdownTracing();
  }
}

main();

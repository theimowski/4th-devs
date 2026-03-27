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
import { baseTools, createNativeHandlers, createHubToolHandler } from './tools.js';
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
initTracing('S03E05-MultiAgent-Explorer');

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
  
  const model = modelMatch ? modelMatch[1].trim() : "anthropic/claude-sonnet-4-6";
  const toolNames = toolsMatch ? toolsMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean) : [];
  
  return { name: agentName, model, toolNames, systemPrompt };
}

export async function runAgent(agentName, userMessage, depth = 0) {
  if (depth > 5) return "Error: Max delegation depth exceeded";
  
  const agent = parseAgent(agentName);
  const maxSteps = agentName === 'toolshed' ? 5 : 15;
  
  log(`Starting agent: ${agentName} (depth: ${depth})`, 'agent', false, debugLogFilePath);

  let agentTools = baseTools.filter(t => agent.toolNames.includes(t.name));
  const handlers = { ...createNativeHandlers(agentName, (subAgent, task) => runAgent(subAgent, task, depth + 1)) };

  let conversation = [
    { role: 'user', content: userMessage }
  ];

  const agentLogic = async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`Step ${step + 1}/${maxSteps} for ${agentName}`, 'agent', false, debugLogFilePath);

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
          conversation.push({ role: "assistant", content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          const toolResults = [];
          for (const call of toolCalls) {
            const handler = handlers[call.name];
            if (handler) {
              const args = JSON.parse(call.arguments);
              const output = await handler(args);
              
              // Handle dynamic tools from toolshed
              if (call.name === 'delegate' && args.agent === 'toolshed') {
                log(`Processing potential tools from toolshed...`, 'agent', false, debugLogFilePath);
                try {
                  // Robust JSON extraction from markdown or raw text
                  let jsonContent = output.trim();
                  if (jsonContent.includes('```')) {
                    const match = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                    if (match) {
                      jsonContent = match[1];
                      log(`Extracted JSON from code block.`, 'agent', false, debugLogFilePath);
                    }
                  }
                  
                  const discoveredTools = JSON.parse(jsonContent);
                  if (Array.isArray(discoveredTools)) {
                    let addedCount = 0;
                    for (const newTool of discoveredTools) {
                      if (newTool.name && !agentTools.find(t => t.name === newTool.name)) {
                        log(`Adding new tool discovered by toolshed: ${newTool.name}`, 'agent', false, debugLogFilePath);
                        agentTools.push(newTool);
                        handlers[newTool.name] = createHubToolHandler(newTool.name);
                        addedCount++;
                      } else if (newTool.name) {
                        log(`Tool already exists, skipping: ${newTool.name}`, 'agent', false, debugLogFilePath);
                      }
                    }
                    if (addedCount === 0) {
                      log(`No new tools were added (either empty list or all were duplicates).`, 'agent', false, debugLogFilePath);
                    }
                  } else {
                    log(`Toolshed returned something that is not an array of tools.`, 'agent', false, debugLogFilePath);
                  }
                } catch (e) {
                  log(`Failed to parse tools from toolshed output. Error: ${e.message}. Output was: ${output.substring(0, 100)}...`, 'agent', false, debugLogFilePath);
                }
              }

              toolResults.push({ type: "function_call_output", call_id: call.call_id, output });
            } else {
              toolResults.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ error: `Unknown tool: ${call.name}` }) });
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
    return "Max steps exceeded";
  };

  return withAgent({ name: agentName, agentId: `${agentName}-${Date.now()}`, task: userMessage }, agentLogic);
}

async function main() {
  try {
    const sessionId = `explore-${Date.now()}`;
    const result = await withTrace({ name: `S03E05 Explorer Main`, sessionId }, async () => {
      return runAgent('player', 'Explore the environment and summarize map and vehicles.');
    });
    console.log(`\nFinal Result:\n${result}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
  } finally {
    await flush();
    await shutdownTracing();
  }
}

main();

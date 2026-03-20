import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModelForProvider } from '../../config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';
import { log, clearLog, extractTokenUsage } from '../utils/utils.js';
import { allTools, createNativeHandlers } from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

clearLog(debugLogFilePath);

function parseAgent(agentName) {
    const filePath = path.join(__dirname, 'agents', `${agentName}.agent.md`);
    if (!fs.existsSync(filePath)) throw new Error(`Agent not found: ${agentName}`);
    
    const raw = fs.readFileSync(filePath, 'utf8');
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error(`Invalid agent format: ${agentName}`);
    
    const frontmatter = match[1];
    const systemPrompt = match[2].trim();
    
    const modelMatch = frontmatter.match(/model:\s*(.*)/);
    const toolsMatch = frontmatter.match(/tools:\n([\s\S]*?)(?=\n\w+:|$)/);
    
    const model = modelMatch ? modelMatch[1].trim() : "google/gemini-3-flash-preview";
    let tools = [];
    if (toolsMatch) {
        tools = toolsMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
    }
    
    return { name: agentName, model, tools, systemPrompt };
}

async function runAgent(agentName, task, depth = 0) {
    if (depth > 5) return "Error: Max delegation depth exceeded";
    
    log(`Starting agent: ${agentName} (depth: ${depth})`, agentName, false, debugLogFilePath);
    
    const agent = parseAgent(agentName);
    const model = resolveModelForProvider(agent.model);
    const handlers = createNativeHandlers(agentName);
    const agentTools = allTools.filter(t => agent.tools.includes(t.name));
    
    let instructions = agent.systemPrompt;
    if (agentName === 'pointer') {
        const apiKey = process.env.HUB_AG3NTS_KEY || "YOUR_API_KEY";
        instructions += `\n\nThe image is available at: https://hub.ag3nts.org/data/${apiKey}/drone.png`;
    } else if (agentName === 'instructor') {
        const droneJsonPath = path.join(__dirname, 'drone.json');
        if (fs.existsSync(droneJsonPath)) {
            const droneJson = fs.readFileSync(droneJsonPath, 'utf8');
            instructions += `\n\n${droneJson}`;
        }
    }

    let conversation = [
        { role: "user", content: task }
    ];

    const MAX_STEPS = 10;
    let step = 0;

    while (step < MAX_STEPS) {
        step++;
        log(`Step ${step}/${MAX_STEPS}`, agentName, false, debugLogFilePath);
        try {
            const data = await chat({
                model: model,
                input: conversation,
                tools: agentTools.length > 0 ? agentTools : undefined,
                instructions: instructions
            });

            log(data, agentName, true, debugLogFilePath);
            const usage = extractTokenUsage(data);
            if (usage) {
                log(`Tokens - In: ${usage.input}, Out: ${usage.output}`, agentName, false, debugLogFilePath);
            }

            // Log reasoning if present
            if (data.output && Array.isArray(data.output)) {
                const reasoning = data.output.find(o => o.type === 'reasoning');
                if (reasoning) {
                    const reasoningText = reasoning.summary?.map(s => s.text).join('\n') || '';
                    if (reasoningText) {
                        log(`Reasoning [${agentName}]: [${reasoning.status}] ${reasoningText}`, agentName, false, debugLogFilePath);
                    }
                }
            }

            const toolCalls = extractToolCalls(data);
            const assistantText = extractText(data);

            if (assistantText) {
                log(`Assistant [${agentName}]: ${assistantText}`, agentName, false, debugLogFilePath);
                conversation.push({ role: "assistant", content: assistantText });
            }

            if (toolCalls.length > 0) {
                let toolResults = [];
                for (const call of toolCalls) {
                    if (call.name === 'delegate') {
                        const args = JSON.parse(call.arguments);
                        log(`Delegating to ${args.agent}: ${args.task}`, agentName, false, debugLogFilePath);
                        const result = await runAgent(args.agent, args.task, depth + 1);
                        toolResults.push({ call_id: call.call_id, output: result, type: "function_call_output" });
                    } else {
                        const result = await executeToolCalls([call], handlers);
                        toolResults.push(...result);
                    }
                }
                
                conversation = [
                    ...conversation,
                    ...toolCalls.map(c => ({ ...c })),
                    ...toolResults.map(r => ({ ...r }))
                ];
            } else {
                return assistantText;
            }
        } catch (error) {
            log(error.message, agentName, false, debugLogFilePath);
            return `Error: ${error.message}`;
        }
    }
    return "Error: Max steps exceeded";
}

async function main() {
    log("Multi-Agent System starting for 'reach a dam' task.", 'system', false, debugLogFilePath);
    const result = await runAgent("operator", "Find instructions for a drone to reach a dam.");
    console.log(`\nFinal Answer:\n${result}`);
}

main().catch(error => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
});

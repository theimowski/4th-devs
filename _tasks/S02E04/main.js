import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModelForProvider } from '../../config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';
import { log, clearLog, extractTokenUsage, formatToolCall } from '../utils/utils.js';
import { allTools, createNativeHandlers } from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

clearLog(debugLogFilePath);

function parseAgent(agentName) {
    const filePath = path.join(__dirname, 'agents', `${agentName}.agent.md`);
    const raw = fs.readFileSync(filePath, 'utf8');
    
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) throw new Error(`Invalid agent format: ${agentName}`);
    
    const frontmatter = match[1];
    const systemPrompt = match[2].trim();
    
    const modelMatch = frontmatter.match(/model:\s*(.*)/);
    const toolsMatch = frontmatter.match(/tools:\n([\s\S]*?)(?=\n\w+:|$)/);
    
    const model = modelMatch ? modelMatch[1].trim() : "google/gemini-3-flash-preview";
    const tools = toolsMatch ? toolsMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean) : [];
    
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
    if (agentName === 'mail') {
        const helpFilePath = path.join(__dirname, 'help.json');
        if (fs.existsSync(helpFilePath)) {
            const helpContent = fs.readFileSync(helpFilePath, 'utf8');
            instructions += `\n\nHelp content:\n${helpContent}`;
        }
    }

    let conversation = [
        { role: "user", content: task }
    ];

    const MAX_STEPS = 15;
    let step = 0;

    while (step < MAX_STEPS) {
        step++;
        log(`Step ${step}/${MAX_STEPS}`, agentName, false, debugLogFilePath);

        try {
            const data = await chat({
                model: model,
                input: conversation,
                tools: agentTools,
                instructions: instructions
            });

            log(data, 'chat-res', true, debugLogFilePath);
            const usage = extractTokenUsage(data);
            if (usage) {
                const cachedPercent = usage.input > 0 ? ((usage.cached / usage.input) * 100).toFixed(1) : "0.0";
                log(`Tokens - In: ${usage.input}, Out: ${usage.output}, Cached: ${cachedPercent}%`, 'token', false, debugLogFilePath);
            }

            const toolCalls = extractToolCalls(data);
            const assistantText = extractText(data);

            if (assistantText) {
                log(`Assistant: ${assistantText}`, agentName, false, debugLogFilePath);
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
                log("No more tool calls.", agentName, false, debugLogFilePath);
                return assistantText;
            }
        } catch (error) {
            log(error.message, 'error', false, debugLogFilePath);
            return `Error: ${error.message}`;
        }
    }
    return "Error: Max steps exceeded";
}

async function question(query) {
    process.stdout.write(query);
    return new Promise(resolve => {
        process.stdin.once('data', data => {
            resolve(data.toString().trim());
        });
    });
}

async function main() {
    while (true) {
        const userInput = await question("\nYour prompt (or 'exit'): ");
        if (userInput.toLowerCase() === 'exit') break;

        await runAgent("main", userInput);
    }
    process.exit(0);
}

main().catch(error => {
    log(error.message, 'error', false, debugLogFilePath);
});

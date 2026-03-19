import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModelForProvider } from '../../config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';
import { log, clearLog, extractTokenUsage, formatToolCall } from '../utils/utils.js';
import { nativeTools, createNativeHandlers } from './tools.js';
import { MODEL, SYSTEM_PROMPT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

clearLog(debugLogFilePath);

async function runAgent(userInput) {
    const model = resolveModelForProvider(MODEL);
    const handlers = createNativeHandlers();
    
    let helpContent = "";
    const helpFilePath = path.join(__dirname, 'help.json');
    if (fs.existsSync(helpFilePath)) {
        helpContent = fs.readFileSync(helpFilePath, 'utf8');
    }

    let conversation = [
        { role: "user", content: userInput }
    ];

    const MAX_STEPS = 20;
    let step = 0;

    while (step < MAX_STEPS) {
        step++;
        log(`Step ${step}/${MAX_STEPS}`, 'agent', false, debugLogFilePath);

        try {
            const data = await chat({
                model: model,
                input: conversation,
                tools: nativeTools,
                instructions: `${SYSTEM_PROMPT}\n\nHelp content:\n${helpContent}`
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
                log(`Agent: ${assistantText}`, 'agent', false, debugLogFilePath);
                console.log(`\nAssistant: ${assistantText}`);
                conversation.push({ role: "assistant", content: assistantText });
            }

            if (toolCalls.length > 0) {
                const toolResults = await executeToolCalls(toolCalls, handlers);
                
                conversation = [
                    ...conversation,
                    ...toolCalls.map(c => ({ ...c })),
                    ...toolResults.map(r => ({ ...r }))
                ];
            } else {
                log("No more tool calls.", 'agent', false, debugLogFilePath);
                break;
            }
        } catch (error) {
            log(error.message, 'error', false, debugLogFilePath);
            break;
        }
    }
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

        await runAgent(userInput);
    }
    process.exit(0);
}

main().catch(error => {
    log(error.message, 'error', false, debugLogFilePath);
});

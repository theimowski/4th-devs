import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModelForProvider } from '../../config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';
import { fetchHubFile, log, clearLog, extractTokenUsage, formatToolCall } from '../utils/utils.js';
import { nativeTools, createNativeHandlers } from './tools.js';
import { MODEL, SYSTEM_PROMPT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFilePath = path.join(__dirname, 'failure.log');
const debugLogFilePath = path.join(__dirname, 'debug.log');

clearLog(debugLogFilePath);

// Download file if missing
if (!fs.existsSync(logFilePath)) {
    log('Downloading failure.log...', 'info', false, debugLogFilePath);
    await fetchHubFile('failure.log', __dirname);
}

async function run() {
    const model = resolveModelForProvider(MODEL);
    const handlers = createNativeHandlers();
    
    let conversation = [
        { role: "user", content: "Analyze the logs and find the last ERROR log entry, then verify it." }
    ];

    const MAX_STEPS = 3;
    let step = 0;
    let solved = false;

    while (step < MAX_STEPS && !solved) {
        step++;
        log(`Step ${step}/${MAX_STEPS}`, 'agent', false, debugLogFilePath);

        try {
            const data = await chat({
                model: model,
                input: conversation,
                tools: nativeTools,
                instructions: SYSTEM_PROMPT
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
                conversation.push({ role: "assistant", content: assistantText });
            }

            if (toolCalls.length > 0) {
                log(toolCalls.map(formatToolCall).join(', '), 'tool', false, debugLogFilePath);

                const toolResults = await executeToolCalls(toolCalls, handlers);
                
                for (const result of toolResults) {
                    const call = toolCalls.find(c => c.call_id === result.call_id);
                    let output = result.output;
                    try {
                        output = JSON.parse(result.output);
                    } catch (e) {}
                    log(`${formatToolCall(call)} -> ${typeof output === 'object' ? JSON.stringify(output) : output}`, 'tool', false, debugLogFilePath);
                    
                    if (output.body && JSON.stringify(output.body).includes("FLG:")) {
                        log(`Flag found: ${JSON.stringify(output.body)}`, 'info', false, debugLogFilePath);
                        solved = true;
                    }
                }

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

run().catch(error => {
    log(error.message, 'error', false, debugLogFilePath);
});

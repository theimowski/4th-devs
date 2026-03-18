import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModelForProvider } from '../../config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';
import { nativeTools, createNativeHandlers } from './tools.js';
import { log, clearLog, extractTokenUsage, formatToolCall } from '../utils/utils.js';
import { AGENT_MODEL, SYSTEM_PROMPT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFilePath = path.join(__dirname, 'debug.log');

clearLog(logFilePath);

async function run() {
    log("Starting Agentic Loop for S02E02", 'agent', false, logFilePath);
    
    const handlers = createNativeHandlers();
    let conversation = [
        { role: "user", content: "Solve the electricity puzzle. Extract grids first, then process ALL squares from 1x1 to 3x3 until the flag is found." }
    ];

    const MAX_STEPS = 100;
    let step = 0;
    let solved = false;

    while (step < MAX_STEPS && !solved) {
        step++;
        log(`Step ${step}/${MAX_STEPS}`, 'agent', false, logFilePath);

        try {
            const data = await chat({
                model: resolveModelForProvider(AGENT_MODEL),
                input: conversation,
                tools: nativeTools,
                instructions: SYSTEM_PROMPT
            });

            log(data, 'chat-res', true, logFilePath);
            const usage = extractTokenUsage(data);
            if (usage) {
                const cachedPercent = usage.input > 0 ? ((usage.cached / usage.input) * 100).toFixed(1) : "0.0";
                log(`Tokens - In: ${usage.input}, Out: ${usage.output}, Cached: ${cachedPercent}%`, 'token', false, logFilePath);
            }

            const toolCalls = extractToolCalls(data);
            const assistantText = extractText(data);

            if (assistantText) {
                log(`Agent: ${assistantText}`, 'agent', false, logFilePath);
                conversation.push({ role: "assistant", content: assistantText });
            }

            if (toolCalls.length > 0) {
                log(toolCalls.map(formatToolCall).join(', '), 'tool', false, logFilePath);

                const toolResults = await executeToolCalls(toolCalls, handlers);
                
                for (const result of toolResults) {
                    const call = toolCalls.find(c => c.call_id === result.call_id);
                    let output = result.output;
                    try {
                        output = JSON.parse(result.output);
                    } catch (e) {}
                    log(`${formatToolCall(call)} -> ${typeof output === 'object' ? JSON.stringify(output) : output}`, 'tool', false, logFilePath);
                    
                    // Check for flag in the tool output
                    const outputStr = JSON.stringify(output);
                    if (outputStr.includes("FLG:")) {
                        const flag = outputStr.match(/FLG:[^"}]+/)?.[0];
                        log(`PUZZLE SOLVED! Flag found: ${flag}`, 'info', false, logFilePath);
                        console.log(`\n🎉 SUCCESS! Flag: ${flag}\n`);
                        solved = true;
                    }
                }

                conversation = [
                    ...conversation,
                    ...toolCalls.map(c => ({ ...c })),
                    ...toolResults.map(r => ({ ...r }))
                ];
            } else {
                log("No more tool calls. Task might be complete.", 'agent', false, logFilePath);
                break;
            }
        } catch (error) {
            log(error.message, 'error', false, logFilePath);
            break;
        }
    }
}

run().catch(error => {
    log(error.message, 'error', false, logFilePath);
});

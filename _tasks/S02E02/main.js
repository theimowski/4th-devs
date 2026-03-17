import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModelForProvider } from '../../config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';
import { nativeTools, createNativeHandlers } from './tools.js';
import { log, clearLog, extractTokenUsage } from '../utils/utils.js';
import { AGENT_MODEL, SYSTEM_PROMPT } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFilePath = path.join(__dirname, 'debug.log');

clearLog(logFilePath);

function formatToolCall(call) {
    const args = JSON.parse(call.arguments);
    const params = Object.values(args)
        .map(v => typeof v === 'string' ? `"${v}"` : v)
        .join(',');
    return `${call.name}(${params})`;
}

async function run() {
    log("Starting Agentic Loop for S02E02", 'agent', false, logFilePath);
    
    const handlers = createNativeHandlers();
    let conversation = [
        { role: "user", content: "Solve the first row of the electricity puzzle. Extract grids first, then process squares 1x1, 1x2, and 1x3. Use filenames only." }
    ];

    const MAX_STEPS = 20;
    let step = 0;

    while (step < MAX_STEPS) {
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
                for (const call of toolCalls) {
                    log(`${formatToolCall(call)}`, 'tool', false, logFilePath);
                }

                const toolResults = await executeToolCalls(toolCalls, handlers);
                
                for (const result of toolResults) {
                    const call = toolCalls.find(c => c.call_id === result.call_id);
                    log(`${formatToolCall(call)} -> ${JSON.stringify(result.output)}`, 'tool', false, logFilePath);
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

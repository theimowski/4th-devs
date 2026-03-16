import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModelForProvider } from '../../config.js';
import { MODEL_NAME, SYSTEM_PROMPT } from './config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';
import { nativeTools, createNativeHandlers } from './tools.js';
import { log, clearLog, extractTokenUsage } from '../utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFilePath = path.join(__dirname, 'debug.log');

// 1. Clear log file
clearLog(logFilePath);

async function run() {
    const state = { runNumber: 1, totalRuns: 0 };
    const MAX_RUNS = 3;
    const MAX_STEPS = 10;

    let conversation = [{ role: "user", content: "Categorize all 10 items from the CSV file. Remember the reactor rule and the 100-token limit per prompt." }];
    let steps = 0;
    const handlers = createNativeHandlers(state);
    
    while (steps < MAX_STEPS && state.totalRuns < MAX_RUNS) {
        steps++;
        log(`Step ${steps}/${MAX_STEPS}`, 'agent', false, logFilePath);
        log(`Current Run: ${state.runNumber} (Total Runs: ${state.totalRuns})`, 'agent', false, logFilePath);
        
        log("Calling Agent...", 'agent', false, logFilePath);
        
        let data;
        try {
            data = await chat({
                model: resolveModelForProvider(MODEL_NAME),
                input: conversation,
                tools: nativeTools,
                instructions: SYSTEM_PROMPT
            });
        } catch (e) {
            log(e.message, 'error', false, logFilePath);
            return;
        }

        const usage = extractTokenUsage(data);
        if (usage) {
            log(`Tokens - In: ${usage.input}, Out: ${usage.output}, Cached: ${usage.cached}`, 'token', false, logFilePath);
        }

        const toolCalls = extractToolCalls(data);
        const finalContent = extractText(data);

        if (toolCalls.length > 0) {
            log(`Tool calls: ${toolCalls.map(c => c.name).join(', ')}`, 'agent', false, logFilePath);
            const toolResults = await executeToolCalls(toolCalls, handlers);

            conversation = [
                ...conversation,
                ...toolCalls,
                ...toolResults
            ];
            
            // Check for FLG in tool results
            for (const result of toolResults) {
                if (result.output && result.output.includes("FLG:")) {
                    log(`SUCCESS! Flag found: ${result.output.match(/FLG:[^}]+/)?.[0]}`, 'agent', false, logFilePath);
                    return;
                }
                // Check if we performed a reset
                const call = toolCalls.find(c => c.call_id === result.call_id);
                if (call && call.name === 'reset') {
                    state.totalRuns++;
                }
            }
        } else if (finalContent) {
            log(`Final Response: ${finalContent}`, 'agent', false, logFilePath);
            if (finalContent.includes("FLG:")) {
                return;
            }
            conversation.push({ role: "assistant", content: finalContent });
            conversation.push({ role: "user", content: "Please continue if there are more items to categorize." });
        } else {
            log(`No tool calls or text in response.`, 'agent', false, logFilePath);
            return;
        }
    }
    
    if (state.totalRuns >= MAX_RUNS) {
        log("Reached MAX_RUNS limit.", 'error', false, logFilePath);
    } else if (steps >= MAX_STEPS) {
        log("Reached MAX_STEPS limit.", 'error', false, logFilePath);
    }
}

run().catch(error => {
    log(error.message, 'error', false, logFilePath);
    process.exit(1);
});

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
    let runNumber = 1;
    const MAX_RUNS = 3;
    const MAX_STEPS = 20;
    const handlers = createNativeHandlers();
    
    let conversation = [{ role: "user", content: "Categorize all 10 items from the CSV file. Remember the reactor rule and the 100-token limit per prompt." }];

    for (let runIdx = 0; runIdx < MAX_RUNS; runIdx++) {
        log(`Starting Run ${runNumber}`, 'agent', false, logFilePath);
        
        let steps = 0;
        let runShouldReset = false;

        while (steps < MAX_STEPS) {
            steps++;
            log(`Step ${steps}/${MAX_STEPS} (Run ${runNumber})`, 'agent', false, logFilePath);
            
            log("Calling Agent...", 'agent', false, logFilePath);
            
            let data;
            try {
                data = await chat({
                    model: resolveModelForProvider(MODEL_NAME),
                    input: conversation,
                    tools: nativeTools,
                    instructions: `${SYSTEM_PROMPT}\n\nCURRENT RUN NUMBER: ${runNumber}. USE THIS FOR ALL TOOL CALLS.`
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
                        runShouldReset = true;
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

            if (runShouldReset) {
                log(`Reset detected. Incrementing runNumber to ${runNumber + 1}`, 'agent', false, logFilePath);
                runNumber++;
                break; // Exit inner loop to start new run
            }
        }

        if (runNumber > MAX_RUNS) {
            log("Reached MAX_RUNS limit.", 'error', false, logFilePath);
            break;
        }
    }
}

run().catch(error => {
    log(error.message, 'error', false, logFilePath);
    process.exit(1);
});

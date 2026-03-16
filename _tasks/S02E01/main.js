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
    let runNumber = 0;
    const MAX_RUNS = 20;
    const MAX_STEPS = 20;
    const handlers = createNativeHandlers();
    
    let conversation = [{ 
        role: "user", 
        content: "Categorize all 10 items from the CSV file. The CSV has 'code' as the item ID - use it in your prompts. Remember the reactor rule and the 100-token limit per prompt.",
        run: 0 
    }];

    for (; runNumber < MAX_RUNS; ) {
        log(`Starting Run Attempt (runNumber: ${runNumber}, max: ${MAX_RUNS})`, 'agent', false, logFilePath);
        
        // Prune conversation to only last 3 runs
        const oldSize = conversation.length;
        conversation = conversation.filter(msg => msg.run >= runNumber - 2);
        if (conversation.length < oldSize) {
            log(`Pruned conversation from ${oldSize} to ${conversation.length} messages (kept runs >= ${runNumber - 2})`, 'agent', false, logFilePath);
        }

        let steps = 0;
        let runShouldReset = false;

        while (steps < MAX_STEPS) {
            steps++;
            log(`Step ${steps}/${MAX_STEPS} (runNumber: ${runNumber})`, 'agent', false, logFilePath);
            
            log("Calling Agent...", 'agent', false, logFilePath);
            
            // ephemeral message for current run info
            const stepConversation = [
                ...conversation,
                { 
                    role: "user", 
                    content: `CURRENT RUN NUMBER: ${runNumber}. ALWAYS use this value when calling 'download_categorize_csv' and 'categorize' tools.`,
                    run: runNumber
                }
            ];

            // Map out the 'run' field before sending to chat API
            const inputForChat = stepConversation.map(({ run, ...rest }) => rest);

            log({ instructions: SYSTEM_PROMPT, input: stepConversation }, 'chat-req', true, logFilePath);

            let data;
            try {
                data = await chat({
                    model: resolveModelForProvider(MODEL_NAME),
                    input: inputForChat,
                    tools: nativeTools,
                    instructions: SYSTEM_PROMPT
                });
                log(data, 'chat-res', true, logFilePath);
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
                    ...toolCalls.map(c => ({ ...c, run: runNumber })),
                    ...toolResults.map(r => ({ ...r, run: runNumber }))
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
                    log(`SUCCESS! Flag found: ${finalContent.match(/FLG:[^}]+/)?.[0]}`, 'agent', false, logFilePath);
                    //return;
                }
                conversation.push({ role: "assistant", content: finalContent, run: runNumber });
                conversation.push({ role: "user", content: "Please continue if there are more items to categorize.", run: runNumber });
            } else {
                log(`No tool calls or text in response.`, 'agent', false, logFilePath);
                return;
            }

            if (runShouldReset) {
                runNumber++;
                log(`Reset detected. Incremented runNumber to ${runNumber}.`, 'agent', false, logFilePath);
                break; // Exit inner loop to start new run iteration
            }
        }

        if (!runShouldReset && steps >= MAX_STEPS) {
            log("Reached MAX_STEPS without reset. Exiting.", 'error', false, logFilePath);
            break;
        }
    }

    if (runNumber >= MAX_RUNS) {
        log("Reached MAX_RUNS limit.", 'error', false, logFilePath);
    }
}

run().catch(error => {
    log(error.message, 'error', false, logFilePath);
    process.exit(1);
});

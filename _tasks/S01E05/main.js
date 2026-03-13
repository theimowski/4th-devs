import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveModelForProvider } from '../../config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';
import { nativeTools, nativeHandlers, setIgnoredHeaders } from './src/tools/index.js';
import { log, clearLog } from './src/log.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const helpPath = path.join(__dirname, 'help.json');
const helpHeadersPath = path.join(__dirname, 'help-headers.json');

// 1. Clear log file
clearLog();

const helpDoc = JSON.parse(fs.readFileSync(helpPath, 'utf-8'));
const helpHeaders = JSON.parse(fs.readFileSync(helpHeadersPath, 'utf-8'));

// Convert keys to lowercase for matching
const ignoredHeaders = Object.fromEntries(
  Object.keys(helpHeaders).map(key => [key.toLowerCase(), true])
);
setIgnoredHeaders(ignoredHeaders);

const systemPrompt = `You are an AI agent controlling a railway system.
Documentation for the "railway" API:
${JSON.stringify(helpDoc, null, 2)}

Your main challenge:
- Activate the "X-01" railway route using the API.
- Make sure that the reconfigure mode is enabled for a route before changing its status.
- Make sure to check that the "X-01" railway route is activated at the end.
- Conform to the help documentation of the API.

Operational Guidelines:
- Do NOT call "help" action.
- Use only the actions documented in help.json.
- Respect 503 errors - when they happen, call "sleep" tool and try again.
- Watch out for request limits - check for HTTP headers (e.g., x-ratelimit-reset) in the response.
- Use exponential backoff as a strategy to increase the wait time if you don't know how long to wait.
- When the API returns in body following fragment {FLG:...}, make note of it and include in final response.
- Read errors in response carefully - it should clearly tell what went wrong.

Available tools:
- call_railway_api(action: string | null, route: string | null, value: string | null) - All 3 arguments are required, but can be null.
- sleep({ seconds: number }) - wait before calling the API again
`;

async function run() {
    let conversation = [{ role: "user", content: "Activate X-01 route and verify it." }];
    let steps = 0;
    const MAX_STEPS = 15;
    const MODEL = resolveModelForProvider("gpt-5.2");
    
    while (steps < MAX_STEPS) {
        steps++;
        log(`Step ${steps}/${MAX_STEPS}`, 'agent');
        
        const summary = conversation.reduce((acc, msg) => {
            acc[msg.role] = (acc[msg.role] || 0) + 1;
            return acc;
        }, {});
        log(`Conversation summary: ${JSON.stringify(summary)}`, 'agent');
        log(conversation, 'conversation-detailed', true);
        
        log("Calling Agent...", 'agent');
        
        let data;
        try {
            data = await chat({
                model: MODEL,
                input: conversation,
                tools: nativeTools,
                instructions: systemPrompt
            });
        } catch (e) {
            log(e.message, 'error');
            return;
        }

        const usage = data.usage || data.usage_metadata;
        if (usage) {
            const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
            const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
            const cachedTokens = usage.input_tokens_details?.cached_tokens || usage.cache_read_tokens || usage.cache_read_tokens_details?.tokens || 0;
            const cachePercent = inputTokens > 0 ? (cachedTokens / inputTokens * 100).toFixed(1) : 0;
            log(`In: ${inputTokens}, Out: ${outputTokens}, Cached: ${cachedTokens} (${cachePercent}%)`, 'token');
        }

        const toolCalls = extractToolCalls(data);
        const finalContent = extractText(data);

        if (toolCalls.length > 0) {
            const toolResults = await executeToolCalls(toolCalls, nativeHandlers);

            conversation = [
                ...conversation,
                ...toolCalls,
                ...toolResults
            ];
        } else if (finalContent) {
            log(`Final Response: ${finalContent}`, 'agent');
            return;
        } else {
            log(`No tool calls or text in response.`, 'agent');
            return;
        }
    }
    log("Reached MAX_STEPS limit.", 'error');
}

run().catch(error => {
    log(error.message, 'error');
    process.exit(1);
});

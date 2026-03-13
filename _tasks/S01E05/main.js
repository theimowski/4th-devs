import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify } from '../utils/utils.js';
import { resolveModelForProvider } from '../../config.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const helpPath = path.join(__dirname, 'help.json');
const logPath = path.join(__dirname, 'log.txt');

// 1. Clear log file
fs.writeFileSync(logPath, '');

function log(message, type = 'info', detailedOnly = false) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${type.toUpperCase()}] ${typeof message === 'object' ? JSON.stringify(message) : message}\n`;
    fs.appendFileSync(logPath, logLine);
    
    if (detailedOnly) return;

    if (type === 'api-req') {
        console.log(`[API Req] ${message}`);
    } else if (type === 'api-res') {
        console.log(`[API Res] status=${message.status}`);
        if (message.body && typeof message.body === 'object' && message.body.FLG) {
            console.log(`[FLAG] ${message.body.FLG}`);
        }
    } else if (type === 'tool-use') {
        console.log(`[Tool] ${message}`);
    } else if (type === 'agent') {
        console.log(`[Agent] ${message}`);
    } else if (type === 'token') {
        console.log(`[Token] ${message}`);
    } else if (type === 'error') {
        console.error(`[Error] ${message}`);
    } else {
        console.log(message);
    }
}

async function callRailwayApi(action) {
    log(`Calling railway API: answer={"action": "${action}"}`, 'api-req');
    
    let response;
    try {
        response = await verify("railway", { action });
    } catch (e) {
        log(`API Fetch Error: ${e.message}`, 'error');
        return { status: 0, error: e.message };
    }

    const status = response.status;
    const headers = Object.fromEntries(response.headers.entries());
    const bodyText = await response.text();
    let body;
    try {
        body = JSON.parse(bodyText);
    } catch (e) {
        body = bodyText;
    }

    log(`status=${status}, headers=${JSON.stringify(headers)}, body=${JSON.stringify(body)}`, 'api-res-detailed', true);
    log({ status, body }, 'api-res');
    
    return { status, headers, body };
}

async function sleep(seconds) {
    log(`Sleeping for ${seconds} seconds`, 'tool-use');
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

const helpDoc = JSON.parse(fs.readFileSync(helpPath, 'utf-8'));

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
- call_railway_api(action: string) - URL-encoded path with query, e.g. "reconfigure?route=x-01"
- sleep(seconds: number) - wait before calling the API again
`;

const tools = [
  {
    type: "function",
    function: {
      name: "call_railway_api",
      description: "Call the railway API with a specific action.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            description: "The URL-encoded path with query, e.g. 'reconfigure?route=x-01'"
          }
        },
        required: ["action"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "sleep",
      description: "Sleep for a specified number of seconds.",
      parameters: {
        type: "object",
        properties: {
          seconds: {
            type: "number",
            description: "Number of seconds to sleep."
          }
        },
        required: ["seconds"]
      }
    }
  }
];

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
                tools: tools,
                instructions: systemPrompt
            });
        } catch (e) {
            log(e.message, 'error');
            return;
        }

        if (data.usage) {
            log(`Input: ${data.usage.prompt_tokens}, Output: ${data.usage.completion_tokens}, Cache: ${data.usage.cache_read_tokens_details?.tokens || 0}`, 'token');
        } else if (data.usage_metadata) {
            log(`Input: ${data.usage_metadata.input_tokens}, Output: ${data.usage_metadata.output_tokens}, Cache: ${data.usage_metadata.cache_read_tokens || 0}`, 'token');
        }

        const toolCalls = extractToolCalls(data);
        const finalContent = extractText(data);

        if (toolCalls.length > 0) {
            conversation = [...conversation, ...toolCalls];
            
            for (const call of toolCalls) {
                const { name, arguments: argsString } = call.function;
                const args = JSON.parse(argsString);
                log(`Executing tool: ${name} with args: ${argsString}`, 'tool-use');
                
                let result;
                if (name === 'call_railway_api') {
                    result = await callRailwayApi(args.action);
                } else if (name === 'sleep') {
                    await sleep(args.seconds);
                    result = { ok: true };
                }
                
                conversation.push({
                    role: "tool",
                    tool_call_id: call.id,
                    name: name,
                    content: JSON.stringify(result)
                });
            }
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

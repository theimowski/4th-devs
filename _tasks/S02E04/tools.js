import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hubApi, log, verify } from '../utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

export const allTools = [
    {
        type: "function",
        name: "zmail_api_call",
        description: "Call zmail API with specified action and parameters. Writes response to file and returns JSON response content.",
        parameters: {
            type: "object",
            properties: {
                action: { type: "string", description: "The API action to perform" },
                parameters: { type: "object", description: "Arguments for the action" }
            },
            required: ["action", "parameters"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "delegate",
        description: "Delegate a task to another specialized agent.",
        parameters: {
            type: "object",
            properties: {
                agent: { type: "string", enum: ["mail"], description: "The name of the agent to delegate to" },
                task: { type: "string", description: "The specific task description for the agent" }
            },
            required: ["agent", "task"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "verify_answer",
        description: "Submit the found data to the verification endpoint.",
        parameters: {
            type: "object",
            properties: {
                password: { type: "string" },
                date: { type: "string", description: "YYYY-MM-DD" },
                confirmation_code: { type: "string" }
            },
            required: ["password", "date", "confirmation_code"],
            additionalProperties: false
        },
        strict: true
    }
];

const sanitize = (str) => String(str).replace(/[^a-z0-9]/gi, '_').toLowerCase();

export const createNativeHandlers = (agentName) => ({
    zmail_api_call: async ({ action, parameters }) => {
        log(`zmail_api_call(${action}, ${JSON.stringify(parameters)})`, 'tool', false, debugLogFilePath);
        try {
            const response = await hubApi('zmail', { action, ...parameters });
            const body = await response.text();
            
            let subDir = action;
            let fileName = `${sanitize(action)}_sample.json`;

            if (action === 'getInbox') {
                subDir = 'inbox';
                fileName = `${sanitize(parameters.page)}_${sanitize(parameters.perPage)}.json`;
            } else if (action === 'getThread') {
                subDir = 'thread';
                fileName = `${sanitize(parameters.threadID)}.json`;
            } else if (action === 'getMessages') {
                subDir = 'messages';
                const ids = Object.values(parameters).flat().map(sanitize).join('_');
                fileName = `${ids}.json`;
            } else if (action === 'search') {
                subDir = 'search';
                fileName = `${sanitize(parameters.query)}.json`;
            }

            const targetDir = path.join(__dirname, 'json', subDir);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            const filePath = path.join(targetDir, fileName);
            fs.writeFileSync(filePath, body);
            
            log(`zmail_api_call -> ok, saved to ${path.relative(__dirname, filePath)}`, 'tool', false, debugLogFilePath);
            return body;
        } catch (error) {
            log(`zmail_api_call error: ${error.message}`, 'error', false, debugLogFilePath);
            return `error: ${error.message}`;
        }
    },
    verify_answer: async (answer) => {
        log(`verify_answer(${JSON.stringify(answer)})`, 'tool', false, debugLogFilePath);
        try {
            const response = await verify("mailbox", answer);
            const body = await response.json();
            const res = { status: response.status, body };
            log(`verify_answer -> ${JSON.stringify(res)}`, 'tool', false, debugLogFilePath);
            return JSON.stringify(res);
        } catch (error) {
            log(`verify_answer error: ${error.message}`, 'error', false, debugLogFilePath);
            return `error: ${error.message}`;
        }
    }
});

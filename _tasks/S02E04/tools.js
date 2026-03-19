import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hubApi, log } from '../utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

export const nativeTools = [
    {
        type: "function",
        name: "zmail_api_call",
        description: "Call zmail API with specified action and parameters. Writes response to file and returns 'ok'.",
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
    }
];

export const createNativeHandlers = () => ({
    zmail_api_call: async ({ action, parameters }) => {
        log(`zmail_api_call(${action}, ${JSON.stringify(parameters)})`, 'tool', false, debugLogFilePath);
        try {
            const response = await hubApi('zmail', { action, ...parameters });
            const body = await response.text();
            fs.writeFileSync(path.join(__dirname, `${action}_sample.json`), body);
            log(`zmail_api_call -> ok, saved to ${action}_sample.json`, 'tool', false, debugLogFilePath);
            return body;
        } catch (error) {
            log(`zmail_api_call error: ${error.message}`, 'error', false, debugLogFilePath);
            return `error: ${error.message}`;
        }
    }
});

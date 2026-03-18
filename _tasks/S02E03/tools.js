import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify as hubVerify } from '../utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFilePath = path.join(__dirname, 'failure.log');

export const nativeTools = [
    {
        type: "function",
        name: "search_logs",
        description: "Search for the last log entry of a given level (INFO, WARN, ERRO, CRIT) in failure.log",
        parameters: {
            type: "object",
            properties: {
                level: { type: "string", enum: ["INFO", "WARN", "ERRO", "CRIT"] }
            },
            required: ["level"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "verify",
        description: "Submit identified logs for verification",
        parameters: {
            type: "object",
            properties: {
                logs: {
                    type: "array",
                    items: { type: "string" },
                    description: "Array of log entries"
                }
            },
            required: ["logs"],
            additionalProperties: false
        },
        strict: true
    }
];

export const createNativeHandlers = () => ({
    search_logs: async ({ level }) => {
        const content = fs.readFileSync(logFilePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes(`[${level.toUpperCase()}]`)) {
                return { status: "success", entry: lines[i] };
            }
        }
        return { status: "error", message: `No log entry found for level ${level}` };
    },
    verify: async ({ logs }) => {
        const answer = { logs: logs.join('\n') };
        const response = await hubVerify("failure", answer);
        const body = await response.json();
        return { status: response.status, body };
    }
});

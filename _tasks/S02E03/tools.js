import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verify as hubVerify, log } from '../utils/utils.js';
import { chat } from '../../01_02_tool_use/src/api.js';
import { COMPRESSION_MODEL, COMPRESSION_PROMPT } from './config.js';
import { resolveModelForProvider } from '../../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFilePath = path.join(__dirname, 'failure.log');
const debugLogFilePath = path.join(__dirname, 'debug.log');

export const nativeTools = [
    {
        type: "function",
        name: "search_logs",
        description: "Search for log entries in failure.log based on levels, timeframe, and keywords. Returns an array of parsed log entries. The timeframe (before - after) MUST NOT exceed 10 minutes, unless a keyword is provided (then up to 60 minutes).",
        parameters: {
            type: "object",
            properties: {
                levels: { 
                    type: "array", 
                    items: { type: "string", enum: ["INFO", "WARN", "ERRO", "CRIT"] },
                    description: "List of log levels to include"
                },
                after: { 
                    type: "string", 
                    description: "Start timeframe (YYYY-MM-DD HH:mm:ss). Inclusive." 
                },
                before: { 
                    type: "string", 
                    description: "End timeframe (YYYY-MM-DD HH:mm:ss). Inclusive." 
                },
                keyword: { 
                    type: "string", 
                    description: "Keyword to search for in log content. Use '*' for no keyword filtering." 
                }
            },
            required: ["levels", "after", "before", "keyword"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "compress_logs",
        description: "Compress log contents using AI. Input: array of strings. Returns: array of compressed strings in the same order.",
        parameters: {
            type: "object",
            properties: {
                contents: { 
                    type: "array", 
                    items: { type: "string" }
                }
            },
            required: ["contents"],
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
                    description: "Array of final condensed logs (strings)"
                }
            },
            required: ["logs"],
            additionalProperties: false
        },
        strict: true
    }
];

const findKeywords = (content) => {
    const matches = content.match(/\b[A-Z0-9]{3,}\b/g);
    if (!matches) return "NONE";
    return [...new Set(matches)].join(',');
};

export const createNativeHandlers = () => ({
    search_logs: async ({ levels, after, before, keyword }) => {
        if (!fs.existsSync(logFilePath)) {
            const err = { status: "error", message: "failure.log not found" };
            log(`search_logs(...) -> ${JSON.stringify(err)}`, 'tool', false, debugLogFilePath);
            return err;
        }

        const afterDate = new Date(after);
        const beforeDate = new Date(before);

        if (isNaN(afterDate.getTime()) || isNaN(beforeDate.getTime())) {
            const err = { status: "error", message: "Invalid date format for 'after' or 'before'." };
            log(`search_logs(...) -> ${JSON.stringify(err)}`, 'tool', false, debugLogFilePath);
            return err;
        }

        const diffMs = beforeDate.getTime() - afterDate.getTime();
        const maxDiffMs = (keyword && keyword !== '*') ? 60 * 60 * 1000 : 10 * 60 * 1000;

        if (diffMs > maxDiffMs) {
            return { status: "error", message: `Timeframe interval exceeds limit (current: ${(diffMs / 60000).toFixed(1)} min, allowed: ${maxDiffMs / 60000} min). Please narrow down your search.` };
        }

        if (diffMs < 0) {
            const err = { status: "error", message: "'before' must be after 'after'." };
            log(`search_logs(...) -> ${JSON.stringify(err)}`, 'tool', false, debugLogFilePath);
            return err;
        }

        const content = fs.readFileSync(logFilePath, 'utf8');
        const lines = content.split('\n').filter(l => l.trim());
        const results = [];

        for (const line of lines) {
            const match = line.match(/^\[(.*?)\] \[(.*?)\] (.*)$/);
            if (!match) continue;

            const [_, timestamp, level, logContent] = match;
            const logDate = new Date(timestamp);

            if (levels.length > 0 && !levels.includes(level)) continue;
            if (logDate < afterDate) continue;
            if (logDate > beforeDate) continue;
            
            if (keyword !== '*' && !logContent.toLowerCase().includes(keyword.toLowerCase())) {
                continue;
            }

            results.push({
                timestamp,
                level,
                content: logContent
            });
        }

        const res = { status: "success", count: results.length, entries: results };
        log(`search_logs(levels: ${JSON.stringify(levels)}, after: ${after}, before: ${before}, keyword: ${keyword}) -> success, items: ${results.length}`, 'tool', false, debugLogFilePath);
        return res;
    },
    compress_logs: async ({ contents }) => {
        log(`compress_logs(contents: ${contents.length})`, 'tool', false, debugLogFilePath);
        
        const timestamp = Date.now();
        if (contents.length === 0) {
            return { status: "success", compressed: [] };
        }

        fs.writeFileSync(path.join(__dirname, `compress_${timestamp}_before.log`), contents.join('\n'));

        const model = resolveModelForProvider(COMPRESSION_MODEL);
        const data = await chat({
            model: model,
            input: [{ role: "user", content: contents.join('\n') }],
            instructions: COMPRESSION_PROMPT
        });

        const resultText = data.output_text || (data.output?.find(o => o.type === 'message')?.content?.[0]?.text) || "";
        fs.writeFileSync(path.join(__dirname, `compress_${timestamp}_after.log`), resultText);

        const compressedLines = resultText.split('\n').filter(l => l.trim());
        
        log(`compress_logs -> count: ${compressedLines.length}`, 'tool', false, debugLogFilePath);
        return { status: "success", compressed: compressedLines };
    },
    verify: async ({ logs }) => {
        const timestamp = Date.now();
        fs.writeFileSync(path.join(__dirname, `verify_${timestamp}.log`), logs.join('\n'));
        const answer = { logs: logs.join('\n') };
        const response = await hubVerify("failure", answer);
        const body = await response.json();
        const res = { status: response.status, body };
        log(`verify(logs: [${logs.length} items]) -> ${JSON.stringify(res)}`, 'tool', false, debugLogFilePath);
        return res;
    }
});

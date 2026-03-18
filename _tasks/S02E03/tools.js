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
        description: "Search for log entries in failure.log based on levels, timeframe, and keywords. Returns an array of parsed log entries. The timeframe (before - after) MUST NOT exceed 10 minutes.",
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
        description: "Compress log entries to a very short format using AI. Input: array of log entries {timestamp, level, content}. Result format: YYYY-MM-DD HH:MM LEVL:COMPRESSED. Result must not exceed 6000 characters.",
        parameters: {
            type: "object",
            properties: {
                entries: { 
                    type: "array", 
                    items: {
                        type: "object",
                        properties: {
                            timestamp: { type: "string" },
                            level: { type: "string" },
                            content: { type: "string" }
                        },
                        required: ["timestamp", "level", "content"],
                        additionalProperties: false
                    }
                }
            },
            required: ["entries"],
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
                    description: "Array of raw log entries (strings)"
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
        const maxDiffMs = 10 * 60 * 1000; // 10 minutes

        if (diffMs > maxDiffMs) {
            const err = { status: "error", message: `Timeframe interval exceeds 10 minutes (current: ${(diffMs / 60000).toFixed(1)} min). Please narrow down your search.` };
            log(`search_logs(...) -> ${JSON.stringify(err)}`, 'tool', false, debugLogFilePath);
            return err;
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
                keyword: findKeywords(logContent),
                content: logContent
            });
        }

        const res = { status: "success", count: results.length, entries: results };
        log(`search_logs(levels: ${JSON.stringify(levels)}, after: ${after}, before: ${before}, keyword: ${keyword}) -> success, items: ${results.length}`, 'tool', false, debugLogFilePath);
        return res;
    },
    compress_logs: async ({ entries }) => {
        log(`compress_logs(entries: ${entries.length})`, 'tool', false, debugLogFilePath);
        
        const timestamp = Date.now();
        const logsToCompress = entries.map(e => `[${e.timestamp}] [${e.level}] ${e.content}`).join('\n');
        fs.writeFileSync(path.join(__dirname, `compress_${timestamp}_before.log`), logsToCompress);

        const model = resolveModelForProvider(COMPRESSION_MODEL);
        const data = await chat({
            model: model,
            input: [{ role: "user", content: logsToCompress }],
            instructions: COMPRESSION_PROMPT
        });

        const resultText = data.output_text || (data.output?.find(o => o.type === 'message')?.content?.[0]?.text) || "";
        const truncatedResult = resultText.length > 6000 ? resultText.substring(0, 5997) + "..." : resultText;
        
        fs.writeFileSync(path.join(__dirname, `compress_${timestamp}_after.log`), truncatedResult);
        
        log(`compress_logs -> count: ${truncatedResult.split('\n').length}, chars: ${truncatedResult.length}`, 'tool', false, debugLogFilePath);
        return { status: "success", compressed: truncatedResult };
    },
    verify: async ({ logs }) => {
        const answer = { logs: logs.join('\n') };
        const response = await hubVerify("failure", answer);
        const body = await response.json();
        const res = { status: response.status, body };
        log(`verify(logs: [${logs.length} items]) -> ${JSON.stringify(res)}`, 'tool', false, debugLogFilePath);
        return res;
    }
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function verify(task, answer) {
  const apikey = process.env.HUB_AG3NTS_KEY;
  const response = await fetch("https://hub.ag3nts.org/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apikey,
      task,
      answer
    })
  });
  return response;
}

export async function fetchHubFile(filename, targetDir) {
  const apikey = process.env.HUB_AG3NTS_KEY;
  const url = `https://hub.ag3nts.org/data/${apikey}/${filename}`;
  const filePath = path.join(targetDir, filename);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${filename}: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(filePath, buffer);
  return buffer;
}

export function log(message, type = 'info', detailed = false, logFilePath = path.join(__dirname, '../debug.log')) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
    const prefixConsole = `[${type.toUpperCase()}]`;
    const formattedMessage = typeof message === 'object' ? JSON.stringify(message, null, 2) : message;
    const logLine = `${prefix} ${formattedMessage}\n`;

    // Always log to file
    fs.appendFileSync(logFilePath, logLine);

    // Only log brief to stdout unless detailed or error
    if (!detailed || type === 'error' || type === 'agent' || type === 'tool') {
        if (typeof message === 'object') {
            console.log(`${prefixConsole} ${JSON.stringify(message, null, 0)}`);
        } else {
            console.log(`${prefixConsole} ${message}`);
        }
    }
}

export function clearLog(logFilePath = path.join(__dirname, '../debug.log')) {
    if (fs.existsSync(logFilePath)) {
        fs.truncateSync(logFilePath, 0);
    }
}

export function extractTokenUsage(data) {
    const usage = data.usage || data.usage_metadata;
    if (!usage) return null;
    
    const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
    const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
    const cachedTokens = usage.input_tokens_details?.cached_tokens || usage.cache_read_tokens || usage.cache_read_tokens_details?.tokens || 0;
    
    return {
        input: inputTokens,
        output: outputTokens,
        cached: cachedTokens
    };
}

export function formatToolCall(call) {
    const args = JSON.parse(call.arguments);
    let params = Object.values(args)
        .map(v => typeof v === 'string' ? `"${v}"` : v)
        .join(',');
    if (params.length > 100) {
        params = params.substring(0, 100) + "(...)";
    }
    return `${call.name}(${params})`;
}

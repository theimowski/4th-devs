import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logPath = path.join(__dirname, '../log.txt');

export function log(message, type = 'info', detailedOnly = false) {
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

export function clearLog() {
    fs.writeFileSync(logPath, '');
}

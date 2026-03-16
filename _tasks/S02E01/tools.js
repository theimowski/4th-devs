import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { fetchHubFile, verify, log } from '../utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const taskDir = __dirname;
const logFilePath = path.join(taskDir, 'debug.log');

export const nativeTools = [
    {
        name: "download_categorize_csv",
        description: "Download the CSV file with items to categorize",
        parameters: { type: "object", properties: {}, required: [] }
    },
    {
        name: "reset",
        description: "Reset the Categorize API state and budget",
        parameters: { type: "object", properties: {}, required: [] }
    },
    {
        name: "categorize",
        description: "Categorize a SINGLE item using a crafted prompt",
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "The concise prompt (max 100 tokens total) to categorize the item. Should result in ONLY 'DNG' or 'NEU'." }
            },
            required: ["prompt"]
        }
    }
];

export const createNativeHandlers = (state) => ({
    download_categorize_csv: async () => {
        log(`Downloading CSV...`, 'agent', false, logFilePath);
        
        const content = await fetchHubFile('categorize.csv', taskDir);
        const csvPath = path.join(taskDir, `categorize-${state.runNumber}.csv`);
        
        // Parse original CSV
        const records = parse(content, {
            columns: false,
            skip_empty_lines: true
        });
        
        // Add headers and empty columns for prompt/answer
        const header = ["id", "description", "prompt", "answer"];
        const rows = records.map(r => [...r, "", ""]);
        
        const output = stringify([header, ...rows]);
        fs.writeFileSync(csvPath, output);
        
        return { status: "success", file: `categorize-${state.runNumber}.csv`, recordsCount: records.length };
    },
    reset: async () => {
        log(`Resetting Categorize API...`, 'agent', false, logFilePath);
        
        const response = await verify("categorize", { prompt: "reset" });
        const body = await response.json();
        log(`Reset response headers: ${JSON.stringify([...response.headers.entries()])}`, 'detailed', true, logFilePath);
        
        state.runNumber++;
        
        return { status: response.status, body };
    },
    categorize: async ({ prompt }) => {
        log(`Categorizing with prompt: "${prompt}"`, 'agent', false, logFilePath);
        
        const response = await verify("categorize", { prompt });
        const body = await response.json();
        log(`Categorize response headers: ${JSON.stringify([...response.headers.entries()])}`, 'detailed', true, logFilePath);
        
        // Update the CSV file
        const csvPath = path.join(taskDir, `categorize-${state.runNumber}.csv`);
        if (fs.existsSync(csvPath)) {
            const content = fs.readFileSync(csvPath, 'utf-8');
            const records = parse(content, { columns: true });
            
            // Find first empty record
            const emptyRecord = records.find(r => !r.prompt && !r.answer);
            if (emptyRecord) {
                emptyRecord.prompt = prompt;
                emptyRecord.answer = JSON.stringify(body);
            }
            
            const output = stringify(records, { header: true });
            fs.writeFileSync(csvPath, output);
        }
        
        return { status: response.status, body };
    }
});

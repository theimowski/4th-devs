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
        type: "function",
        name: "download_categorize_csv",
        description: "Download the CSV file with items to categorize",
        parameters: {
            type: "object",
            properties: {
                runNumber: { type: "number", description: "The current run number" }
            },
            required: ["runNumber"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "reset",
        description: "Reset the Categorize API state and budget",
        parameters: { 
            type: "object", 
            properties: {}, 
            required: [],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "categorize",
        description: "Categorize a SINGLE item using a crafted prompt",
        parameters: {
            type: "object",
            properties: {
                prompt: { type: "string", description: "The concise prompt (max 100 tokens total) to categorize the item. Should result in ONLY 'DNG' or 'NEU'." },
                runNumber: { type: "number", description: "The current run number" }
            },
            required: ["prompt", "runNumber"],
            additionalProperties: false
        },
        strict: true
    }
];

export const createNativeHandlers = () => ({
    download_categorize_csv: async ({ runNumber }) => {
        log(`Downloading CSV for run ${runNumber}...`, 'agent', false, logFilePath);
        
        const content = await fetchHubFile('categorize.csv', taskDir);
        const csvPath = path.join(taskDir, `categorize-${runNumber}.csv`);
        
        // CSV has code,description. We want to treat 'code' as 'id'.
        const records = parse(content, {
            columns: true,
            skip_empty_lines: true
        });
        
        // Map 'code' to 'id' and add empty prompt/answer
        const mappedRecords = records.map(r => ({
            id: r.code,
            description: r.description,
            prompt: "",
            answer: ""
        }));
        
        const output = stringify(mappedRecords, { header: true });
        fs.writeFileSync(csvPath, output);
        
        return { status: "success", runNumber, file: `categorize-${runNumber}.csv`, recordsCount: mappedRecords.length };
    },
    reset: async () => {
        log(`Resetting Categorize API...`, 'agent', false, logFilePath);
        
        const response = await verify("categorize", { prompt: "reset" });
        const bodyText = await response.text();
        let body;
        try {
            body = bodyText ? JSON.parse(bodyText) : null;
        } catch (e) {
            body = bodyText;
        }
        
        log({ 
            status: response.status, 
            headers: Object.fromEntries(response.headers.entries()), 
            body 
        }, 'api-res-detailed', true, logFilePath);
        
        return { status: response.status, body };
    },
    categorize: async ({ prompt, runNumber }) => {
        log(`Categorizing with prompt (run ${runNumber}): "${prompt}"`, 'agent', false, logFilePath);
        
        const response = await verify("categorize", { prompt });
        const bodyText = await response.text();
        let body;
        try {
            body = bodyText ? JSON.parse(bodyText) : null;
        } catch (e) {
            body = bodyText;
        }

        log({ 
            status: response.status, 
            headers: Object.fromEntries(response.headers.entries()), 
            body 
        }, 'api-res-detailed', true, logFilePath);
        
        // Update the CSV file
        const csvPath = path.join(taskDir, `categorize-${runNumber}.csv`);
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

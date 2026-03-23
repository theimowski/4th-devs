import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveModelForProvider } from '../../config.js';
import { chat } from '../../01_02_tool_use/src/api.js';
import { extractTokenUsage } from '../utils/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sensorsDir = path.join(__dirname, 'sensors');
const MODEL_NAME = "google/gemini-3.1-flash-lite-preview";

const validRanges = {
    temperature_K: { min: 553, max: 873, type: 'temperature' },
    pressure_bar: { min: 60, max: 160, type: 'pressure' },
    water_level_meters: { min: 5.0, max: 15.0, type: 'water' },
    voltage_supply_v: { min: 229.0, max: 231.0, type: 'voltage' },
    humidity_percent: { min: 40.0, max: 80.0, type: 'humidity' }
};

async function classifyNotes(uniqueNotes) {
    const notesListStr = uniqueNotes.map((note, i) => `${i}: ${note}`).join('\n');

    const systemPrompt = `Analyze sensor operator notes. 
Output ONLY a JSON array of indices (numbers) for notes that indicate an anomaly, error, instability, concern, fault, or need for investigation (BAD notes). 
Use 0-based indexing (the first note provided is index 0).
If a note sounds nominal, healthy, consistent, or OK, do NOT include its index.
Example output: [1, 2, 5]`;

    const model = resolveModelForProvider(MODEL_NAME);
    console.log(`Calling LLM (${MODEL_NAME}) to classify ${uniqueNotes.length} unique notes...`);
    
    const response = await chat({
        model: model,
        input: [{ role: "user", content: notesListStr }],
        instructions: systemPrompt
    });

    const usage = extractTokenUsage(response);
    if (usage) {
        console.log(`LLM Usage - Input: ${usage.input}, Output: ${usage.output}, Total: ${usage.total}`);
    }

    const assistantContent = response.output?.[0]?.content?.[0]?.text || "";
    console.log("LLM Raw Output:", assistantContent);

    let badIndices = [];
    try {
        const match = assistantContent.match(/\[.*\]/s);
        if (match) {
            badIndices = JSON.parse(match[0]);
        }
    } catch (e) {
        console.error("Failed to parse LLM response:", assistantContent);
    }
    return badIndices;
}

async function processLLMClassification(notesToIds) {
    const uniqueNotes = Object.keys(notesToIds);
    const badIndices = await classifyNotes(uniqueNotes);

    const okIds = [];
    const badIds = [];

    uniqueNotes.forEach((note, index) => {
        const ids = notesToIds[note];
        if (badIndices.includes(index)) {
            badIds.push(...ids);
        } else {
            okIds.push(...ids);
        }
    });

    okIds.sort((a, b) => a - b);
    badIds.sort((a, b) => a - b);

    const safeModelName = MODEL_NAME.replace(/\//g, '-').replace(/\./g, '-');
    fs.writeFileSync(path.join(__dirname, `${safeModelName}_OK.json`), JSON.stringify(okIds, null, 2));
    fs.writeFileSync(path.join(__dirname, `${safeModelName}_BAD.json`), JSON.stringify(badIds, null, 2));

    console.log(`LLM Result (${safeModelName}): ${okIds.length} OK, ${badIds.length} BAD.`);
}

async function main() {
    const files = fs.readdirSync(sensorsDir).filter(file => file.endsWith('.json'));
    
    // Read manually refined bad notes list
    const badNotesIds = JSON.parse(fs.readFileSync(path.join(__dirname, 'bad.json'), 'utf8'));

    // 1. Programmatic Anomaly Detection (Keeping it separate as per previous logic)
    const programmaticAnomalies = [];
    const notesToIds = {};

    files.forEach(file => {
        const filePath = path.join(sensorsDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const id = parseInt(file.replace('.json', ''), 10);
        
        // Group notes
        const note = data.operator_notes;
        if (!notesToIds[note]) {
            notesToIds[note] = [];
        }
        notesToIds[note].push(id);

        const activeTypes = data.sensor_type ? data.sensor_type.split('/') : [];
        let isOff = false;

        for (const [field, config] of Object.entries(validRanges)) {
            const val = data[field];
            const isActive = activeTypes.includes(config.type);

            if (val !== 0 && (val < config.min || val > config.max)) isOff = true;
            if (!isActive && val !== 0) isOff = true;
            if (isActive && val === 0) isOff = true;
        }

        // Anomaly only if measurement is off BUT operator note is "OK" (not in bad.json)
        if (isOff && !badNotesIds.includes(id)) {
            programmaticAnomalies.push(id);
        }
    });

    programmaticAnomalies.sort((a, b) => a - b);
    fs.writeFileSync(path.join(__dirname, 'anomalies.json'), JSON.stringify(programmaticAnomalies, null, 2));
    console.log(`Programmatic anomalies found: ${programmaticAnomalies.length}. Saved to anomalies.json`);

    // 2. LLM Classification of Operator Notes
    // await processLLMClassification(notesToIds);
}

main().catch(console.error);

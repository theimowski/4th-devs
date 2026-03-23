import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveModelForProvider } from '../../config.js';
import { chat } from '../../01_02_tool_use/src/api.js';
import { extractTokenUsage } from '../utils/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sensorsDir = path.join(__dirname, 'sensors');
const MODEL_NAME = "gpt-5.4";

const validRanges = {
    temperature_K: { min: 553, max: 873, type: 'temperature' },
    pressure_bar: { min: 60, max: 160, type: 'pressure' },
    water_level_meters: { min: 5.0, max: 15.0, type: 'water' },
    voltage_supply_v: { min: 229.0, max: 231.0, type: 'voltage' },
    humidity_percent: { min: 40.0, max: 80.0, type: 'humidity' }
};

async function classifyFragments(uniqueFragments) {
    const fragmentsListStr = uniqueFragments.map((frag, i) => `${i}: ${frag}`).join('\n');

    const systemPrompt = `Analyze sensor operator note fragments. 
Output ONLY a JSON array of indices (numbers) for fragments that indicate an anomaly, error, instability, concern, fault, or need for investigation (BAD fragments). 
Use 0-based indexing (the first fragment provided is index 0).
If a fragment sounds nominal, healthy, consistent, or OK, do NOT include its index.
Example output: [1, 2, 5]`;

    const model = resolveModelForProvider(MODEL_NAME);
    console.log(`Calling LLM (${MODEL_NAME}) to classify ${uniqueFragments.length} unique fragments...`);
    
    const response = await chat({
        model: model,
        input: [{ role: "user", content: fragmentsListStr }],
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

async function processLLMClassification(idToNote) {
    // 1. Extract unique fragments
    const allFragments = new Set();
    const idToFragments = {};

    for (const [id, note] of Object.entries(idToNote)) {
        const frags = note.split(',').map(f => f.trim().toLowerCase()).filter(Boolean);
        idToFragments[id] = frags;
        frags.forEach(f => allFragments.add(f));
    }

    const uniqueFragments = Array.from(allFragments).sort();
    const badFragmentIndices = await classifyFragments(uniqueFragments);
    const badFragments = new Set(badFragmentIndices.map(idx => uniqueFragments[idx]));

    // 2. Determine BAD IDs based on fragments
    const badIds = [];

    for (const [id, frags] of Object.entries(idToFragments)) {
        const numId = parseInt(id, 10);
        const isBad = frags.some(f => badFragments.has(f));
        if (isBad) {
            badIds.push(numId);
        }
    }

    badIds.sort((a, b) => a - b);

    // Save to bad.json as requested
    fs.writeFileSync(path.join(__dirname, 'bad.json'), JSON.stringify(badIds, null, 2));
    console.log(`LLM Result saved to bad.json: ${badIds.length} files with BAD notes.`);
    
    return badIds;
}

async function main() {
    const files = fs.readdirSync(sensorsDir).filter(file => file.endsWith('.json'));
    
    // 1. Collect all notes first
    const idToNote = {};
    const fileData = {};

    files.forEach(file => {
        const filePath = path.join(sensorsDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const id = parseInt(file.replace('.json', ''), 10);
        idToNote[id] = data.operator_notes;
        fileData[id] = data;
    });

    // 2. LLM Classification of Operator Notes
    const badNotesIds = await processLLMClassification(idToNote);

    // 3. Programmatic Anomaly Assessment
    const anomalies = [];

    for (const id in fileData) {
        const data = fileData[id];
        const numId = parseInt(id, 10);
        const activeTypes = data.sensor_type ? data.sensor_type.split('/') : [];
        
        let isOff = false;
        for (const [field, config] of Object.entries(validRanges)) {
            const val = data[field];
            const isActive = activeTypes.includes(config.type);

            if (val !== 0 && (val < config.min || val > config.max)) isOff = true;
            if (!isActive && val !== 0) isOff = true;
            //if (isActive && val === 0) isOff = true;
        }

        // Anomaly logic:
        // contradiction between measurements and notes
        const isInBadJson = badNotesIds.includes(numId);
        if ((isOff) || (!isOff && isInBadJson)) {
            anomalies.push(numId);
        }
    }

    anomalies.sort((a, b) => a - b);
    fs.writeFileSync(path.join(__dirname, 'anomalies.json'), JSON.stringify(anomalies));
    console.log(`Final anomalies found: ${anomalies.length}. Saved to anomalies.json`);
}

main().catch(console.error);

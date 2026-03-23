import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const badJsonPath = path.join(__dirname, 'google-gemini-3-1-flash-lite-preview_BAD.json');
const manualJsonPath = path.join(__dirname, 'manual.json');

const falsePositives = [2986, 4497, 5299, 5554, 5939, 6371, 7264, 7491, 9326];

function createManualJson() {
    if (!fs.existsSync(badJsonPath)) {
        console.error(`File not found: ${badJsonPath}`);
        return;
    }

    const badIds = JSON.parse(fs.readFileSync(badJsonPath, 'utf8'));
    const filteredIds = badIds.filter(id => !falsePositives.includes(id));

    fs.writeFileSync(manualJsonPath, JSON.stringify(filteredIds, null, 2));
    console.log(`Manual JSON written to ${manualJsonPath}. Total items: ${filteredIds.length} (Excluded ${falsePositives.length} false positives)`);
}

createManualJson();

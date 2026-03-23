import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const badJsonPath = path.join(__dirname, 'google-gemini-2-5-flash_BAD.json');
const outputTxtPath = path.join(__dirname, 'google-gemini-2-5-flash_BAD.txt');
const sensorsDir = path.join(__dirname, 'sensors');

function generateBadNotesReport() {
    if (!fs.existsSync(badJsonPath)) {
        console.error(`File not found: ${badJsonPath}`);
        return;
    }

    const badIds = JSON.parse(fs.readFileSync(badJsonPath, 'utf8'));
    let report = '';

    badIds.forEach(id => {
        const fileName = `${String(id).padStart(4, '0')}.json`;
        const filePath = path.join(sensorsDir, fileName);
        
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            report += `[${fileName}] ${data.operator_notes}\n`;
        } else {
            report += `[${fileName}] FILE NOT FOUND\n`;
        }
    });

    fs.writeFileSync(outputTxtPath, report);
    console.log(`Report written to ${outputTxtPath}`);
    console.log('\n--- BAD Notes Report ---\n');
    console.log(report);
}

generateBadNotesReport();

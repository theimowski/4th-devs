import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fetchHubFile } from '../utils/utils.js';
import { MODEL, getPrompt } from './config.js';
import { vision, extractText } from './ai.js';
import { crop } from './image.js';

const __dirname = import.meta.dirname;
const inputPath = path.join(__dirname, 'electricity.png');
const outputPath = path.join(__dirname, 'electricity-grid.png');

async function run() {
    if (!fs.existsSync(inputPath)) {
        console.log("Fetching electricity.png...");
        await fetchHubFile('electricity.png', __dirname);
    }

    const imageBuffer = fs.readFileSync(inputPath);
    const metadata = await sharp(imageBuffer).metadata();
    const base64Image = imageBuffer.toString('base64');

    console.log(`Calling vision model: ${MODEL}...`);
    const prompt = getPrompt(metadata.width, metadata.height);
    const data = await vision(MODEL, prompt, base64Image);

    const resultText = extractText(data);
    console.log("Model response:", resultText);

    const match = resultText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found in response");
    
    const coords = JSON.parse(match[0]);
    console.log("Coordinates:", coords);

    console.log("Cropping...");
    await crop(inputPath, coords, outputPath);

    console.log(`Saved crop to ${outputPath}`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

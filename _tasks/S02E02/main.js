import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fetchHubFile } from '../utils/utils.js';
import { MODEL, getGridPrompt, getSquarePrompt } from './config.js';
import { vision, extractText } from './ai.js';
import { crop } from './image.js';

const __dirname = import.meta.dirname;
const originalPath = path.join(__dirname, 'electricity.png');
const gridPath = path.join(__dirname, 'electricity-grid.png');
const squarePath = path.join(__dirname, 'electricity-1x1.png');

async function run() {
    if (!fs.existsSync(originalPath)) {
        console.log("Fetching electricity.png...");
        await fetchHubFile('electricity.png', __dirname);
    }

    // STEP 1: Extract the grid from the original image
    console.log("\n--- STEP 1: Extracting Grid ---");
    const originalBuffer = fs.readFileSync(originalPath);
    const originalMetadata = await sharp(originalBuffer).metadata();
    const originalBase64 = originalBuffer.toString('base64');

    console.log(`Calling vision model for grid: ${MODEL}...`);
    const gridPrompt = getGridPrompt(originalMetadata.width, originalMetadata.height);
    const gridData = await vision(MODEL, gridPrompt, originalBase64);
    const gridResultText = extractText(gridData);
    
    const gridCoordsMatch = gridResultText.match(/\{[\s\S]*\}/);
    if (!gridCoordsMatch) throw new Error("No JSON found in grid response");
    const gridCoords = JSON.parse(gridCoordsMatch[0]);
    console.log("Grid Coordinates:", gridCoords);

    console.log("Cropping grid...");
    await crop(originalPath, gridCoords, gridPath);
    console.log(`Saved grid to ${gridPath}`);

    // STEP 2: Extract the 1x1 square from the grid image
    console.log("\n--- STEP 2: Extracting 1x1 Square ---");
    const gridBuffer = fs.readFileSync(gridPath);
    const gridMetadata = await sharp(gridBuffer).metadata();
    const gridBase64 = gridBuffer.toString('base64');

    console.log(`Calling vision model for square: ${MODEL}...`);
    const squarePrompt = getSquarePrompt(gridMetadata.width, gridMetadata.height);
    const squareData = await vision(MODEL, squarePrompt, gridBase64);
    const squareResultText = extractText(squareData);

    const squareCoordsMatch = squareResultText.match(/\{[\s\S]*\}/);
    if (!squareCoordsMatch) throw new Error("No JSON found in square response");
    const squareCoords = JSON.parse(squareCoordsMatch[0]);
    console.log("Square Coordinates:", squareCoords);

    console.log("Cropping 1x1 square...");
    await crop(gridPath, squareCoords, squarePath);
    console.log(`Saved 1x1 square to ${squarePath}`);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

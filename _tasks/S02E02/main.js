import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fetchHubFile } from '../utils/utils.js';
import { MODEL, CATEGORIZATION_MODEL, getGridPrompt, getSquarePromptForPos, getCategorizationPrompt } from './config.js';
import { vision, extractText } from './ai.js';
import { crop } from './image.js';

const __dirname = import.meta.dirname;
const originalPath = path.join(__dirname, 'electricity.png');
const gridPath = path.join(__dirname, 'electricity-grid.png');

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

    // STEP 2 & 3: Iterate through the grid, extract and categorize each square
    const gridBuffer = fs.readFileSync(gridPath);
    const gridMetadata = await sharp(gridBuffer).metadata();
    const gridBase64 = gridBuffer.toString('base64');

    const results = [];

    for (let row = 1; row <= 3; row++) {
        for (let col = 1; col <= 3; col++) {
            console.log(`\n--- Processing Square [Row ${row}, Col ${col}] ---`);
            
            const squarePath = path.join(__dirname, `electricity-${row}x${col}.png`);
            
            // Extract Square
            console.log(`Calling vision model for square ${row}x${col}: ${MODEL}...`);
            const squarePrompt = getSquarePromptForPos(row, col, gridMetadata.width, gridMetadata.height);
            const squareData = await vision(MODEL, squarePrompt, gridBase64);
            const squareResultText = extractText(squareData);

            const squareCoordsMatch = squareResultText.match(/\{[\s\S]*\}/);
            if (!squareCoordsMatch) {
                console.error(`No JSON found in square response for ${row}x${col}`);
                continue;
            }
            const squareCoords = JSON.parse(squareCoordsMatch[0]);
            console.log(`Square ${row}x${col} Coordinates:`, squareCoords);

            console.log(`Cropping square ${row}x${col}...`);
            await crop(gridPath, squareCoords, squarePath);
            
            // Categorize Square
            const finalSquareBuffer = fs.readFileSync(squarePath);
            const finalSquareBase64 = finalSquareBuffer.toString('base64');

            console.log(`Calling vision model for categorization: ${CATEGORIZATION_MODEL}...`);
            const categorizationPrompt = getCategorizationPrompt();
            const categorizationData = await vision(CATEGORIZATION_MODEL, categorizationPrompt, finalSquareBase64);
            const categorizationResultText = extractText(categorizationData);
            console.log(`Categorization Result for ${row}x${col}:`, categorizationResultText);
            
            results.push({ pos: `${row}x${col}`, result: categorizationResultText });
        }
    }

    console.log("\n--- FINAL RESULTS ---");
    console.table(results);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

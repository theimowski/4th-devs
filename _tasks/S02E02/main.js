import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fetchHubFile } from '../utils/utils.js';
import { MODEL, CATEGORIZATION_MODEL, getGridPrompt, getSquarePromptForPos, getCategorizationPrompt } from './config.js';
import { vision, extractText } from './ai.js';
import { crop } from './image.js';
import { turns } from './turns.js';

const __dirname = import.meta.dirname;
const solvedPath = path.join(__dirname, 'solved_electricity.png');
const gridPath = path.join(__dirname, 'solved_electricity-grid.png');

async function run() {
    if (!fs.existsSync(solvedPath)) {
        throw new Error("solved_electricity.png not found!");
    }

    // STEP 1: Extract the grid from the SOLVED image
    console.log("\n--- STEP 1: Extracting Grid from Solved Image ---");
    const solvedBuffer = fs.readFileSync(solvedPath);
    const solvedMetadata = await sharp(solvedBuffer).metadata();
    const solvedBase64 = solvedBuffer.toString('base64');

    console.log(`Calling vision model for grid: ${MODEL}...`);
    const gridPrompt = getGridPrompt(solvedMetadata.width, solvedMetadata.height);
    const gridData = await vision(MODEL, gridPrompt, solvedBase64);
    const gridResultText = extractText(gridData);
    
    const gridCoordsMatch = gridResultText.match(/\{[\s\S]*\}/);
    if (!gridCoordsMatch) throw new Error("No JSON found in grid response");
    const gridCoords = JSON.parse(gridCoordsMatch[0]);
    console.log("Grid Coordinates:", gridCoords);

    console.log("Cropping grid...");
    await crop(solvedPath, gridCoords, gridPath);
    console.log(`Saved solved grid to ${gridPath}`);

    // STEP 2 & 3: Iterate through the grid, extract and categorize each square from SOLVED grid
    const gridBuffer = fs.readFileSync(gridPath);
    const gridMetadata = await sharp(gridBuffer).metadata();
    const gridBase64 = gridBuffer.toString('base64');

    const finalResults = [];

    for (let row = 1; row <= 3; row++) {
        for (let col = 1; col <= 3; col++) {
            console.log(`\n--- Processing Square [Row ${row}, Col ${col}] ---`);
            
            const solvedSquarePath = path.join(__dirname, `solved_electricity-${row}x${col}.png`);
            const originalSquarePath = path.join(__dirname, `electricity-${row}x${col}.png`);
            
            if (!fs.existsSync(originalSquarePath)) {
                console.warn(`Original square file ${originalSquarePath} not found. Skipping comparison.`);
                continue;
            }

            // Extract Solved Square
            console.log(`Calling vision model for solved square ${row}x${col}: ${MODEL}...`);
            const squarePrompt = getSquarePromptForPos(row, col, gridMetadata.width, gridMetadata.height);
            const squareData = await vision(MODEL, squarePrompt, gridBase64);
            const squareResultText = extractText(squareData);

            const squareCoordsMatch = squareResultText.match(/\{[\s\S]*\}/);
            if (!squareCoordsMatch) {
                console.error(`No JSON found in square response for ${row}x${col}`);
                continue;
            }
            const squareCoords = JSON.parse(squareCoordsMatch[0]);
            
            console.log(`Cropping solved square ${row}x${col}...`);
            await crop(gridPath, squareCoords, solvedSquarePath);
            
            // Categorize both Original and Solved squares
            const categorizeSquare = async (p, model) => {
                const buffer = fs.readFileSync(p);
                const base64 = buffer.toString('base64');
                const prompt = getCategorizationPrompt();
                const data = await vision(model, prompt, base64);
                return parseInt(extractText(data).trim());
            };

            console.log("Classifying original square...");
            const originalValue = await categorizeSquare(originalSquarePath, CATEGORIZATION_MODEL);
            console.log(`Original [${row}x${col}] value: ${originalValue}`);

            console.log("Classifying solved square...");
            const solvedValue = await categorizeSquare(solvedSquarePath, CATEGORIZATION_MODEL);
            console.log(`Solved [${row}x${col}] value: ${solvedValue}`);
            
            // Compare using turns function
            const numTurns = turns(originalValue, solvedValue);
            console.log(`Turns needed for [${row}x${col}]: ${numTurns}`);
            
            finalResults.push({ 
                pos: `${row}x${col}`, 
                original: originalValue, 
                solved: solvedValue, 
                turns: numTurns 
            });
        }
    }

    console.log("\n--- FINAL COMPARISON RESULTS ---");
    console.table(finalResults);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

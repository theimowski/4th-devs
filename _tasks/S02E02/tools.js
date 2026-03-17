import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { MODEL, CATEGORIZATION_MODEL, getGridPrompt, getSquarePromptForPos, getCategorizationPrompt } from './config.js';
import { vision, extractText } from './ai.js';
import { crop } from './image.js';

const __dirname = import.meta.dirname;

export const nativeTools = [
    {
        type: "function",
        name: "extract_grid",
        description: "Extract the 3x3 grid from an image and save it to a new file. Use filenames only.",
        parameters: {
            type: "object",
            properties: {
                inputFile: { type: "string", description: "Filename of the source image" },
                outputFile: { type: "string", description: "Filename where the cropped grid should be saved" }
            },
            required: ["inputFile", "outputFile"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "extract_square",
        description: "Extract a specific square (row/col) from a grid image and save it to a new file. Use filenames only.",
        parameters: {
            type: "object",
            properties: {
                inputFile: { type: "string", description: "Filename of the grid image" },
                outputFile: { type: "string", description: "Filename where the cropped square should be saved" },
                row: { type: "number", description: "Row index (1-3)" },
                col: { type: "number", description: "Column index (1-3)" }
            },
            required: ["inputFile", "outputFile", "row", "col"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "classify_square",
        description: "Classify the line pattern in a square image. Returns a number 0-15. Use filename only.",
        parameters: {
            type: "object",
            properties: {
                imageFile: { type: "string", description: "Filename of the square image" }
            },
            required: ["imageFile"],
            additionalProperties: false
        },
        strict: true
    },
    {
        type: "function",
        name: "turn",
        description: "Turn a square at a given position (e.g., '1x1') 90 degrees right (dry-run).",
        parameters: {
            type: "object",
            properties: {
                pos: { type: "string", description: "Position of the square (e.g., '1x1')" }
            },
            required: ["pos"],
            additionalProperties: false
        },
        strict: true
    }
];

export const createNativeHandlers = () => ({
    extract_grid: async ({ inputFile, outputFile }) => {
        const fullInputPath = path.join(__dirname, inputFile);
        const fullOutputPath = path.join(__dirname, outputFile);
        
        const buffer = fs.readFileSync(fullInputPath);
        const metadata = await sharp(buffer).metadata();
        const base64 = buffer.toString('base64');

        const prompt = getGridPrompt(metadata.width, metadata.height);
        const data = await vision(MODEL, prompt, base64);
        const resultText = extractText(data);
        
        const match = resultText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON found in grid response");
        const coords = JSON.parse(match[0]);

        await crop(fullInputPath, coords, fullOutputPath);
        
        return { 
            status: "success", 
            coords, 
            dimensions: { width: metadata.width, height: metadata.height },
            outputFile
        };
    },
    extract_square: async ({ inputFile, outputFile, row, col }) => {
        const fullInputPath = path.join(__dirname, inputFile);
        const fullOutputPath = path.join(__dirname, outputFile);
        
        const buffer = fs.readFileSync(fullInputPath);
        const metadata = await sharp(buffer).metadata();
        const base64 = buffer.toString('base64');

        const prompt = getSquarePromptForPos(row, col, metadata.width, metadata.height);
        const data = await vision(MODEL, prompt, base64);
        const resultText = extractText(data);

        const match = resultText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON found in square response");
        const coords = JSON.parse(match[0]);

        await crop(fullInputPath, coords, fullOutputPath);
        
        return { 
            status: "success", 
            coords, 
            dimensions: { width: metadata.width, height: metadata.height },
            outputFile
        };
    },
    classify_square: async ({ imageFile }) => {
        const fullPath = path.join(__dirname, imageFile);
        const buffer = fs.readFileSync(fullPath);
        const base64 = buffer.toString('base64');

        const prompt = getCategorizationPrompt();
        const data = await vision(CATEGORIZATION_MODEL, prompt, base64);
        const resultText = extractText(data);
        
        const value = parseInt(resultText.trim());
        return { status: "success", value };
    },
    turn: async ({ pos }) => {
        console.log(`[DRY-RUN] Turning square ${pos}...`);
        return { status: "success", message: `Turned square ${pos}` };
    }
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHubFile } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Process power plants
const content = await fetchHubFile('findhim_locations.json');
const { power_plants: powerPlants } = JSON.parse(content);

// Process candidates from S01E01
const resultsPath = path.join(__dirname, '../S01E01/results.json');

if (!fs.existsSync(resultsPath)) {
  throw new Error(`Critical file missing: ${resultsPath}. Please complete S01E01 first.`);
}

const resultsContent = fs.readFileSync(resultsPath, 'utf-8');
const candidates = JSON.parse(resultsContent);

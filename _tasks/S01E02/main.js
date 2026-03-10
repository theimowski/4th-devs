import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHubFile } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Process power plants
const content = await fetchHubFile('findhim_locations.json');
const { power_plants: powerPlants } = JSON.parse(content);

console.log('--- Power Plants ---');
for (const name in powerPlants) {
  console.log(name);
}

// Process candidates from S01E01
const resultsPath = path.join(__dirname, '../S01E01/results.json');
if (fs.existsSync(resultsPath)) {
  const resultsContent = fs.readFileSync(resultsPath, 'utf-8');
  const candidates = JSON.parse(resultsContent);

  console.log('\n--- People from S01E01 ---');
  for (const person of candidates) {
    console.log(person.name);
  }
}

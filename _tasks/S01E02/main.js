import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchHubFile } from './utils.js';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { tools, handlers } from './src/tools/index.js';
import { executeToolCalls } from '../../01_02_tool_use/src/executor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Prepare Data
const content = await fetchHubFile('findhim_locations.json');
const { power_plants: powerPlants } = JSON.parse(content);

const resultsPath = path.join(__dirname, '../S01E01/results.json');
if (!fs.existsSync(resultsPath)) {
  throw new Error(`Critical file missing: ${resultsPath}. Please complete S01E01 first.`);
}
const candidates = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));

// 2. Configure Model and Tools
const MODEL = "gpt-5-mini";
const MAX_ROUNDS = 10;

const instructions = `You are a specialized agent tasked with finding the closest power plant for a list of candidates.
Follow these steps strictly:
1. Use 'get_power_plants_locations' to get coordinates for the provided power plants.
2. Use 'get_people_locations' to get all historical locations for the provided candidates.
3. Use 'get_people_closest_plant_location' by providing the results from the previous two steps.
4. Return the final result as a JSON array matching the structure of the last tool's output.

Data to process:
- Power Plants: ${JSON.stringify(powerPlants)}
- Candidates: ${JSON.stringify(candidates.map(c => ({ name: c.name, surname: c.surname })))}
`;

// 3. Main Process Query Loop
const candidatesJsonPath = path.join(__dirname, 'candidates.json');

if (fs.existsSync(candidatesJsonPath)) {
  console.log("candidates.json already exists. Skipping tool-use loop.");
} else {
  let conversation = [{ role: "user", content: "Please find the closest power plant for each candidate using the provided data and your tools." }];

  console.log("Starting tool-use loop...");

  for (let round = 0; round < MAX_ROUNDS; round++) {
    console.log(`\n--- Round ${round + 1} ---`);
    const response = await chat({ 
      model: MODEL, 
      input: conversation, 
      tools, 
      instructions 
    });

    const toolCalls = extractToolCalls(response);

    if (toolCalls.length === 0) {
      const text = extractText(response);
      console.log("Final response received.");
      
      // Attempt to parse JSON from response text
      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        const finalJson = JSON.parse(jsonMatch ? jsonMatch[0] : text);
        fs.writeFileSync(candidatesJsonPath, JSON.stringify(finalJson, null, 2));
        console.log("Results saved to candidates.json");
      } catch (e) {
        console.error("Failed to parse final JSON result:", e.message);
        fs.writeFileSync(candidatesJsonPath, text);
      }
      break;
    }

    const toolResults = await executeToolCalls(toolCalls, handlers);

    conversation = [
      ...conversation,
      ...toolCalls,
      ...toolResults
    ];
  }
}

// 4. Print closest candidate
if (fs.existsSync(candidatesJsonPath)) {
  const finalCandidates = JSON.parse(fs.readFileSync(candidatesJsonPath, 'utf-8'));
  if (Array.isArray(finalCandidates) && finalCandidates.length > 0) {
    const closest = finalCandidates.reduce((min, p) => p.distance < min.distance ? p : min, finalCandidates[0]);
    console.log("\nCandidate with smallest distance:");
    console.log(JSON.stringify(closest, null, 2));
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from './config.js';
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
const MODEL = "gpt-5";
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

// 4. Process closest candidate and call accesslevel API
if (fs.existsSync(candidatesJsonPath)) {
  const finalCandidates = JSON.parse(fs.readFileSync(candidatesJsonPath, 'utf-8'));
  if (Array.isArray(finalCandidates) && finalCandidates.length > 0) {
    const closest = finalCandidates.reduce((min, p) => p.distance < min.distance ? p : min, finalCandidates[0]);
    console.log("\nCandidate with smallest distance:");
    console.log(JSON.stringify(closest, null, 2));

    console.log(`\nCalling accesslevel API for ${closest.name} ${closest.surname}...`);
    try {
      const response = await fetch('https://hub.ag3nts.org/api/accesslevel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apikey: config.API_KEY,
          name: closest.name,
          surname: closest.surname,
          birthYear: 1993
        })
      });

      const data = await response.json();
      console.log('Access Level Response:', JSON.stringify(data, null, 2));

      const finalAnswer = {
        name: closest.name,
        surname: closest.surname,
        accessLevel: data.accessLevel,
        powerPlant: closest.powerPlant
      };

      console.log('\nFinal Answer Object:');
      console.log(JSON.stringify(finalAnswer, null, 2));

      // 5. Verification
      console.log('\nSending verification to https://hub.ag3nts.org/verify...');
      const verifyResponse = await fetch('https://hub.ag3nts.org/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apikey: config.API_KEY,
          task: "findhim",
          answer: finalAnswer
        })
      });

      const verifyData = await verifyResponse.json();
      console.log(`Verification Status: ${verifyResponse.status}`);
      console.log('Verification Response:', JSON.stringify(verifyData, null, 2));
    } catch (error) {
      console.error('Failed to call accesslevel API:', error.message);
    }
  }
}

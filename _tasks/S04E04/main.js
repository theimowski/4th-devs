import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, clearLog, extractTokenUsage, verify as verifyUtil } from '../utils/utils.js';
import {
  initTracing,
  withTrace,
  withAgent,
  flush,
  shutdownTracing,
  startGeneration,
  advanceTurn,
} from '../utils/langfuse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  const rootEnvPath = path.join(__dirname, '../../.env');
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}

clearLog(debugLogFilePath);
initTracing('S04E04-Natan');

// --- Load Natan's notes and API help ---

function loadNotes() {
  const notesDir = path.join(__dirname, 'workspace', 'natan_notes');
  const files = ['README.md', 'rozmowy.txt', 'ogłoszenia.txt', 'transakcje.txt'];
  return files.map(f => {
    const content = readFileSync(path.join(notesDir, f), 'utf-8');
    return `=== ${f} ===\n${content}`;
  }).join('\n\n');
}

const notes = loadNotes();
const helpJson = readFileSync(path.join(__dirname, 'help.json'), 'utf-8');

// --- Tool definition ---

const tools = [
  {
    type: 'function',
    name: 'verify',
    description: 'Call the filesystem API. Pass an array of actions for batch mode, or a single action object.',
    parameters: {
      type: 'object',
      properties: {
        answer: {
          description: 'A single action object (e.g. {"action":"done"}) or an array of action objects for batch mode.'
        }
      },
      required: ['answer']
    }
  }
];

async function verifyHandler({ answer }) {
  log(`API call: ${JSON.stringify(answer).slice(0, 200)}`, 'tool', false, debugLogFilePath);
  const res = await verifyUtil('filesystem', answer);
  const data = await res.json();
  log(`API response: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
  return JSON.stringify(data);
}

// --- System prompt ---

const SYSTEM_PROMPT = `You are organizing trade notes into a remote virtual filesystem via API.

TASK: Analyze the notes below, then build the required structure using ONE batch API call, followed immediately by "done".

Required filesystem structure:
  /miasta/<city>   content: JSON object { "<good_ascii>": <quantity>, ... }
                   — what the city NEEDS; no units; no Polish characters in keys or values
  /osoby/<name>    content: "First Last\\n[cityname](../miasta/<cityname>)"
                   — exactly ONE person per file with their full name (First + Last) and a relative markdown link
  /towary/<good>   content: "[cityname](../miasta/<cityname>)"
                   — the city that SELLS/OFFERS this good; one link per selling city (multiple lines if needed)
                   — good name = singular nominative, no Polish characters

Rules:
- No Polish characters anywhere: ą→a, ć→c, ę→e, ł→l, ń→n, ó→o, ś→s, ź→z, ż→z
- File and directory names: lowercase letters, digits, underscores only; max 20 characters
- Markdown links MUST use relative paths: ../miasta/puck  (NOT /miasta/puck)
- Each /osoby file must contain exactly one person's FULL name (First name + Surname)
  - If notes only show a surname, infer a plausible Polish first name from context
    (e.g. "Rafal oddzwonil...woda dla Brudzewa" → Rafal is the Brudzewo contact → Rafal Kisiel)
  - If notes show two clues like "krotki sygnal od Konkel" + "Teraz to Lena pilnuje" → Lena Konkel

WORKFLOW:
1. Think through the data: cities and their needs, persons per city, goods sold per city
2. Make ONE batch verify call with ONLY createDirectory actions (all 3 directories)
3. Make ONE batch verify call with ONLY createFile actions (all files)
4. Call verify with {"action":"done"}
5. Return the full API response — report the flag {FLG:...} if present, or describe what went wrong

--- API REFERENCE ---

${helpJson}

--- NATAN'S NOTES ---

${notes}

--- END OF NOTES ---`;

// --- Agent loop ---

async function runAgent() {
  const maxSteps = 20;
  const model = 'openai/gpt-5.2';
  const userMessage = "Organize Natan's trade notes into the remote virtual filesystem.";

  let conversation = [{ role: 'user', content: userMessage }];

  const agentLogic = async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`--- Step ${step + 1}/${maxSteps} ---`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model, input: conversation });

      try {
        const data = await chat({
          model,
          input: conversation,
          tools,
          instructions: SYSTEM_PROMPT,
        });

        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`Assistant: ${text}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: 'assistant', content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          log(`Requested ${toolCalls.length} tool call(s).`, 'agent', false, debugLogFilePath);
          const toolResults = [];
          for (const call of toolCalls) {
            let args = {};
            try {
              args = call.arguments ? JSON.parse(call.arguments) : {};
            } catch (e) {
              toolResults.push({
                type: 'function_call_output',
                call_id: call.call_id,
                output: JSON.stringify({ error: `Invalid JSON in arguments: ${e.message}` }),
              });
              continue;
            }
            const output = await verifyHandler(args);
            toolResults.push({ type: 'function_call_output', call_id: call.call_id, output });
          }
          conversation = [...conversation, ...toolCalls.map(c => ({ ...c })), ...toolResults];
        } else {
          if (text) return text;
        }
      } catch (error) {
        generation.error(error);
        log(`Error: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
    return 'Max steps exceeded';
  };

  return withAgent({ name: 'natan-organizer', agentId: `natan-${Date.now()}`, task: userMessage }, agentLogic);
}

async function main() {
  try {
    const sessionId = `s04e04-${Date.now()}`;
    const result = await withTrace({ name: 'S04E04 Natan', sessionId }, async () => {
      return runAgent();
    });
    console.log(`\nFinal Result:\n${result}`);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
  } finally {
    await flush();
    await shutdownTracing();
  }
}

main();

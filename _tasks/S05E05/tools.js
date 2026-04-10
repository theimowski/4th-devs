import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { generateTTS } from './elevenlabs.js';
import { API_TASK } from './config.js';
import { verify } from '../utils/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Sync ratio formula ---

function computeSyncRatioValue(day, month, year) {
  const raw = (day * 8 + month * 12 + year * 7) % 101;
  const decimal = parseFloat((raw / 100).toFixed(2));
  return { raw, decimal };
}

// --- Readline helper ---

function readLine(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// --- Tool definitions ---

export const toolDefs = [
  {
    type: 'function',
    name: 'get_config',
    description: 'Retrieve the current configuration and state of the CHRONOS-P1 device (internalMode, flux density, device state, all parameter values).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'configure_param',
    description: 'Set a single API-configurable parameter on the device. Device must be in standby mode. After setting date parameters (year/month/day), inspect the response body for stabilization guidance.',
    parameters: {
      type: 'object',
      properties: {
        param: {
          type: 'string',
          enum: ['day', 'month', 'year', 'syncRatio', 'stabilization'],
          description: 'The parameter to configure.',
        },
        value: {
          type: 'number',
          description: 'The value to set.',
        },
      },
      required: ['param', 'value'],
    },
  },
  {
    type: 'function',
    name: 'compute_sync_ratio',
    description: 'Compute the syncRatio for a given target date using the formula: (day×8 + month×12 + year×7) mod 101, expressed as a decimal 0.00–1.00. Call this before setting syncRatio via configure_param.',
    parameters: {
      type: 'object',
      properties: {
        day: { type: 'number', description: 'Target day (1–31).' },
        month: { type: 'number', description: 'Target month (1–12).' },
        year: { type: 'number', description: 'Target year (1500–2499).' },
      },
      required: ['day', 'month', 'year'],
    },
  },
  {
    type: 'function',
    name: 'ask_operator',
    description: 'Speak a message aloud to the human operator (via TTS) and print it to the console, then wait for their typed reply. Use this whenever you need to instruct the operator to change a manual setting, wait for internalMode, or confirm an action.',
    parameters: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'The message to speak and display to the operator.',
        },
      },
      required: ['message'],
    },
  },
  {
    type: 'function',
    name: 'reset_device',
    description: 'Send a reset command to the device. Use if the device is unresponsive or in an unexpected state.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

// --- Tool handlers ---

let ttsCounter = 0;

export function makeToolHandlers(log, debugLogFilePath) {
  return {
    get_config: async () => {
      log('[tool] get_config', 'tool', false, debugLogFilePath);
      const res = await verify(API_TASK, { action: 'getConfig' });
      const data = await res.json();
      log(`[tool] get_config response: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
      return JSON.stringify(data);
    },

    configure_param: async ({ param, value }) => {
      log(`[tool] configure_param ${param}=${value}`, 'tool', false, debugLogFilePath);
      const res = await verify(API_TASK, { action: 'configure', param, value });
      const data = await res.json();
      log(`[tool] configure_param response: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
      return JSON.stringify(data);
    },

    compute_sync_ratio: async ({ day, month, year }) => {
      const result = computeSyncRatioValue(day, month, year);
      log(`[tool] compute_sync_ratio day=${day} month=${month} year=${year} → raw=${result.raw} decimal=${result.decimal}`, 'tool', false, debugLogFilePath);
      return JSON.stringify(result);
    },

    ask_operator: async ({ message }) => {
      console.log(`\n[AGENT] ${message}\n`);
      log(`[tool] ask_operator: ${message}`, 'tool', false, debugLogFilePath);

      try {
        const ttsBuffer = await generateTTS(message);
        ttsCounter++;
        const tmpPath = path.join(__dirname, `tts_${ttsCounter}.mp3`);
        writeFileSync(tmpPath, ttsBuffer);
        spawnSync('afplay', [tmpPath]);
      } catch (err) {
        log(`[tool] TTS error (continuing): ${err.message}`, 'error', false, debugLogFilePath);
      }

      const reply = await readLine('> ');
      log(`[tool] operator replied: ${reply}`, 'tool', false, debugLogFilePath);
      return JSON.stringify({ operatorReply: reply });
    },

    reset_device: async () => {
      log('[tool] reset_device', 'tool', false, debugLogFilePath);
      const res = await verify(API_TASK, { action: 'reset' });
      const data = await res.json();
      log(`[tool] reset_device response: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
      return JSON.stringify(data);
    },
  };
}

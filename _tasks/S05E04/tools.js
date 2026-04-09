import crypto from 'node:crypto';
import { log } from '../utils/utils.js';
import { withTool } from '../utils/langfuse.js';

// --- Retry with exponential backoff ---

class ClientError extends Error {
  constructor(body) {
    super('HTTP 400');
    this.body = body;
  }
}

async function checkResponse(res) {
  if (res.status === 400) {
    const body = await res.text();
    throw new ClientError(body);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function retry(fn, maxAttempts = 5, label = 'operation') {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ClientError) throw err;
      if (attempt === maxAttempts) throw err;
      log(`Retry ${attempt}/${maxAttempts} for ${label} after error: ${err.message}`, 'info');
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

// --- Tool definitions ---

export const operatorToolDefs = [
  {
    type: 'function',
    name: 'command',
    description: 'Send a command to the rocket navigation game. Use "start" to begin, then "go", "left", or "right" to move.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['start', 'go', 'left', 'right'],
          description: 'The command to send.'
        }
      },
      required: ['command']
    }
  },
  {
    type: 'function',
    name: 'delegate',
    description: 'Delegate a task to a sub-agent.',
    parameters: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          enum: ['rocker', 'radioman'],
          description: 'The sub-agent to delegate to.'
        },
        task: {
          type: 'string',
          description: 'Natural language task description for the sub-agent.'
        }
      },
      required: ['agent', 'task']
    }
  }
];

export const rockerToolDefs = [
  {
    type: 'function',
    name: 'getmessage',
    description: 'Fetch a radio hint about rock position in the next column.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

export const radiomanToolDefs = [
  {
    type: 'function',
    name: 'scanFrequency',
    description: 'Scan for OKO radar signals. Returns raw response text — may be "It\'s clear!" or garbled JSON with frequency/detectionCode.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    type: 'function',
    name: 'disarmTrap',
    description: 'Disarm a detected radar trap. Computes the disarm hash and sends disarm request.',
    parameters: {
      type: 'object',
      properties: {
        detectionCode: {
          type: 'string',
          description: 'The detection code extracted from the scanner response.'
        },
        frequency: {
          type: 'number',
          description: 'The frequency value extracted from the scanner response.'
        }
      },
      required: ['detectionCode', 'frequency']
    }
  }
];

// --- Handler factories ---

export function makeOperatorHandlers(runAgentFn, verify, logFn, debugLogFilePath) {
  return {
    command: async ({ command }) => {
      return withTool({ name: 'command', input: { command } }, async () => {
        logFn(`[operator] command: ${command}`, 'tool', false, debugLogFilePath);
        try {
          const result = await retry(async () => {
            const res = await verify('goingthere', { command });
            await checkResponse(res);
            return res.json();
          }, 5, `command:${command}`);
          logFn(`[operator] command response: ${JSON.stringify(result)}`, 'tool', false, debugLogFilePath);
          return JSON.stringify(result);
        } catch (err) {
          logFn(`[operator] command error: ${err.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: err instanceof ClientError ? err.body : err.message });
        }
      });
    },

    delegate: async ({ agent, task }) => {
      return withTool({ name: 'delegate', input: { agent, task } }, async () => {
        logFn(`[operator] delegating to ${agent}: ${task}`, 'tool', false, debugLogFilePath);
        const result = await runAgentFn(agent, task);
        logFn(`[operator] ${agent} returned: ${String(result).slice(0, 200)}`, 'tool', false, debugLogFilePath);
        return result;
      });
    }
  };
}

export function makeRockerHandlers(hubApi, logFn, debugLogFilePath) {
  return {
    getmessage: async () => {
      return withTool({ name: 'getmessage', input: {} }, async () => {
        logFn('[rocker] calling getmessage', 'tool', false, debugLogFilePath);
        try {
          const result = await retry(async () => {
            const res = await hubApi('getmessage');
            await checkResponse(res);
            return res.json();
          }, 5, 'getmessage');
          logFn(`[rocker] hint: ${JSON.stringify(result)}`, 'tool', false, debugLogFilePath);
          return JSON.stringify(result);
        } catch (err) {
          logFn(`[rocker] getmessage error: ${err.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: err instanceof ClientError ? err.body : err.message });
        }
      });
    }
  };
}

export function makeRadiomanHandlers(hubApiGet, hubApi, logFn, debugLogFilePath) {
  return {
    scanFrequency: async () => {
      return withTool({ name: 'scanFrequency', input: {} }, async () => {
        logFn('[radioman] scanning frequency', 'tool', false, debugLogFilePath);
        try {
          const text = await retry(async () => {
            const res = await hubApiGet('frequencyScanner');
            await checkResponse(res);
            return res.text();
          }, 5, 'scanFrequency');
          logFn(`[radioman] scan result: ${text.slice(0, 300)}`, 'tool', false, debugLogFilePath);
          return text;
        } catch (err) {
          logFn(`[radioman] scanFrequency error: ${err.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: err instanceof ClientError ? err.body : err.message });
        }
      });
    },

    disarmTrap: async ({ detectionCode, frequency }) => {
      return withTool({ name: 'disarmTrap', input: { detectionCode, frequency } }, async () => {
        logFn(`[radioman] disarming trap — frequency: ${frequency}, code: ${String(detectionCode).slice(0, 40)}`, 'tool', false, debugLogFilePath);
        try {
          const disarmHash = crypto.createHash('sha1').update(detectionCode + 'disarm').digest('hex');
          logFn(`[radioman] disarmHash: ${disarmHash}`, 'tool', false, debugLogFilePath);
          const result = await retry(async () => {
            const res = await hubApi('frequencyScanner', { frequency, disarmHash });
            await checkResponse(res);
            return res.json();
          }, 5, 'disarmTrap');
          logFn(`[radioman] disarm response: ${JSON.stringify(result)}`, 'tool', false, debugLogFilePath);
          return JSON.stringify(result);
        } catch (err) {
          logFn(`[radioman] disarmTrap error: ${err.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: err instanceof ClientError ? err.body : err.message });
        }
      });
    }
  };
}

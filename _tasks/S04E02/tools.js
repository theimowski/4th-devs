import { log } from '../utils/utils.js';
import { withTool } from '../utils/langfuse.js';
import { verify } from '../utils/utils.js';

async function windpowerApi(answer) {
  const res = await verify('windpower', answer);
  return res.json();
}

async function pollUntilDone(matcher, isDone, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (!isDone()) {
    if (Date.now() > deadline) throw new Error('Timeout polling getResult');
    const data = await windpowerApi({ action: 'getResult' });
    if (data.sourceFunction) {
      matcher(data);
    } else {
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

export const windpowerTools = [
  {
    type: 'function',
    name: 'startAndFetchData',
    description: 'Starts the service window, fetches weather forecast, turbine check spec, and powerplant requirements in parallel. Returns combined data object including turbinecheck (satisfying the turbinecheck-before-done requirement).',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    type: 'function',
    name: 'generateUnlockCodes',
    description: 'Generates unlock codes for all config points in parallel and returns a ready-to-use batch config object for sendConfigAndDone.',
    parameters: {
      type: 'object',
      properties: {
        configs: {
          type: 'array',
          description: 'Array of config points needing unlock codes.',
          items: {
            type: 'object',
            properties: {
              datetime: { type: 'string', description: 'Datetime in format "YYYY-MM-DD HH:00:00"' },
              windMs: { type: 'number', description: 'Wind speed in m/s at this datetime from weather data' },
              pitchAngle: { type: 'number', description: 'Blade pitch angle: 0, 45, or 90 degrees' },
              turbineMode: { type: 'string', description: '"production" or "idle"' }
            },
            required: ['datetime', 'windMs', 'pitchAngle', 'turbineMode']
          }
        }
      },
      required: ['configs']
    }
  },
  {
    type: 'function',
    name: 'sendConfigAndDone',
    description: 'Sends batch turbine schedule configuration and immediately calls done to finalize. Returns the flag on success. All config points must include valid unlockCode values.',
    parameters: {
      type: 'object',
      properties: {
        configs: {
          type: 'object',
          description: 'Batch config object keyed by "YYYY-MM-DD HH:00:00". Each value: { pitchAngle, turbineMode, unlockCode }.'
        }
      },
      required: ['configs']
    }
  }
];

export function createWindpowerHandlers(debugLogFilePath) {
  return {
    startAndFetchData: async () => {
      return withTool({ name: 'startAndFetchData', input: {} }, async () => {
        log('Starting service window', 'tool', false, debugLogFilePath);

        const startData = await windpowerApi({ action: 'start' });
        log(`Start response: ${JSON.stringify(startData)}`, 'tool', false, debugLogFilePath);

        await Promise.all([
          windpowerApi({ action: 'get', param: 'weather' }),
          windpowerApi({ action: 'get', param: 'turbinecheck' }),
          windpowerApi({ action: 'get', param: 'powerplantcheck' })
        ]);

        const results = {};
        await pollUntilDone(
          (data) => { results[data.sourceFunction] = data; },
          () => results.weather && results.turbinecheck && results.powerplantcheck
        );

        log(`Fetched all data: ${Object.keys(results).join(', ')}`, 'tool', false, debugLogFilePath);
        return JSON.stringify({ weather: results.weather, turbinecheck: results.turbinecheck, powerplantcheck: results.powerplantcheck });
      });
    },

    generateUnlockCodes: async ({ configs }) => {
      return withTool({ name: 'generateUnlockCodes', input: { configs } }, async () => {
        log(`Generating ${configs.length} unlock codes in parallel`, 'tool', false, debugLogFilePath);

        // Build a lookup map from "startDate startHour" → { pitchAngle, turbineMode }
        const configLookup = {};
        await Promise.all(configs.map(({ datetime, windMs, pitchAngle, turbineMode }) => {
          const [startDate, startHour] = datetime.split(' ');
          configLookup[`${startDate} ${startHour}`] = { pitchAngle, turbineMode };
          return windpowerApi({
            action: 'unlockCodeGenerator',
            startDate,
            startHour,
            windMs,
            pitchAngle
          });
        }));

        const collected = [];
        await pollUntilDone(
          (data) => {
            if (data.sourceFunction === 'unlockCodeGenerator') {
              log(`Unlock code result: ${JSON.stringify(data)}`, 'tool', false, debugLogFilePath);
              collected.push(data);
            }
          },
          () => collected.length >= configs.length
        );

        // Build ready-to-use batch config keyed by "YYYY-MM-DD HH:00:00"
        const batchConfig = {};
        for (const result of collected) {
          const dt = `${result.signedParams.startDate} ${result.signedParams.startHour}`;
          const { pitchAngle, turbineMode } = configLookup[dt] ?? {};
          batchConfig[dt] = { pitchAngle, turbineMode, unlockCode: result.unlockCode };
        }

        log(`Built batch config for: ${Object.keys(batchConfig).join(', ')}`, 'tool', false, debugLogFilePath);
        return JSON.stringify(batchConfig);
      });
    },

    sendConfigAndDone: async ({ configs }) => {
      return withTool({ name: 'sendConfigAndDone', input: { configs } }, async () => {
        log(`Sending batch config: ${Object.keys(configs).length} points`, 'tool', false, debugLogFilePath);
        const configData = await windpowerApi({ action: 'config', configs });
        log(`Config response: ${JSON.stringify(configData)}`, 'tool', false, debugLogFilePath);

        if (configData.code < 0) {
          return JSON.stringify({ error: 'Config failed', details: configData });
        }

        log('Calling done action', 'tool', false, debugLogFilePath);
        const doneData = await windpowerApi({ action: 'done' });
        log(`Done response: ${JSON.stringify(doneData)}`, 'tool', false, debugLogFilePath);
        return JSON.stringify({ configResult: configData, doneResult: doneData });
      });
    }
  };
}

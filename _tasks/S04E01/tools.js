import { log } from '../utils/utils.js';
import { withTool } from '../utils/langfuse.js';
import { getPage } from './browser.js';

export const operatorTools = [
  {
    type: 'function',
    name: 'delegate',
    description: 'Delegate a task to a sub-agent.',
    parameters: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'The name of the agent to delegate to.',
          enum: ['crawler', 'hacker']
        },
        task: {
          type: 'string',
          description: 'The task description for the sub-agent.'
        }
      },
      required: ['agent', 'task']
    }
  }
];

export const hackerTools = [
  {
    type: 'function',
    name: 'dry_run',
    description: 'Simulate an API call without executing it. Prints the intended action and parameters to console.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'The API action to perform (e.g. reconfigure, setstatus, save, done).'
        },
        params: {
          type: 'object',
          description: 'The parameters for the action (e.g. { route, value }).'
        }
      },
      required: ['action', 'params']
    }
  }
];

export const crawlerTools = [
  {
    type: 'function',
    name: 'navigate',
    description: 'Navigate the browser to a URL and return the page title, URL and body text.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to.'
        }
      },
      required: ['url']
    }
  },
  {
    type: 'function',
    name: 'evaluate',
    description: 'Execute JavaScript on the current page to extract data. Must not mutate application data (create/update/delete records). The only permitted exception is filling and submitting the login form for initial authentication.',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute in the browser context. Must return a serializable value.'
        }
      },
      required: ['code']
    }
  }
];

export function createNativeHandlers(agentName, runAgentFn, debugLogFilePath) {
  return {
    delegate: async ({ agent, task }) => {
      return withTool({ name: 'delegate', input: { agent, task } }, async () => {
        log(`[${agentName}] Delegating to ${agent}: ${task}`, 'tool', false, debugLogFilePath);
        const result = await runAgentFn(agent, task);
        return result;
      });
    },
    dry_run: async ({ action, params }) => {
      return withTool({ name: 'dry_run', input: { action, params } }, async () => {
        const formatted = `[DRY RUN] action=${action} params=${JSON.stringify(params, null, 2)}`;
        console.log(formatted);
        log(formatted, 'tool', false, debugLogFilePath);
        return JSON.stringify({ status: 'dry_run_executed', action, params });
      });
    }
  };
}

export function createBrowserHandlers(debugLogFilePath) {
  return {
    navigate: async ({ url }) => {
      return withTool({ name: 'navigate', input: { url } }, async () => {
        log(`Navigating to: ${url}`, 'tool', false, debugLogFilePath);
        try {
          const page = getPage();
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
          const title = await page.title();
          const currentUrl = page.url();
          const bodyText = await page.innerText('body');
          const data = JSON.stringify({
            title,
            url: currentUrl,
            bodyText: bodyText.substring(0, 3000)
          });
          log(`Navigated to: ${title} (${currentUrl})`, 'tool', false, debugLogFilePath);
          return `<untrusted_content>${data}</untrusted_content>`;
        } catch (error) {
          log(`Navigation failed: ${error.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: error.message });
        }
      });
    },

    evaluate: async ({ code }) => {
      return withTool({ name: 'evaluate', input: { code } }, async () => {
        log(`Evaluating JS: ${code.substring(0, 100)}`, 'tool', false, debugLogFilePath);
        try {
          const page = getPage();
          const result = await page.evaluate(code);
          const output = JSON.stringify(result);
          log(`Evaluate result: ${output.substring(0, 200)}`, 'tool', false, debugLogFilePath);
          return `<untrusted_content>${output}</untrusted_content>`;
        } catch (error) {
          log(`Evaluate failed: ${error.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: error.message });
        }
      });
    }
  };
}

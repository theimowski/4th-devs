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
    name: 'hack',
    description: 'Execute an OKO Editor API action. Returns HTTP status code and response body. Follow the API documentation strictly: adhere to the syntax.answer structure, respect required/optional fields, and follow all rules.',
    parameters: {
      type: 'object',
      properties: {
        answer: {
          type: 'object',
          description: 'The answer object as per the OKO Editor API documentation.',
          properties: {
            action: { type: 'string', enum: ['update', 'done', 'help'], description: 'The API action.' },
            page: { type: 'string', enum: ['incydenty', 'notatki', 'zadania'], description: 'Required for update.' },
            id: { type: 'string', description: 'Record ID (32-char hex). Required for update.' },
            content: { type: 'string', description: 'New description text (optional for update).' },
            title: { type: 'string', description: 'New title (optional for update).' },
            done: { type: 'string', enum: ['YES', 'NO'], description: 'Only for page zadania (optional).' }
          },
          required: ['action']
        }
      },
      required: ['answer']
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
    hack: async ({ answer }) => {
      return withTool({ name: 'hack', input: { answer } }, async () => {
        log(`HACK: ${JSON.stringify(answer)}`, 'tool', false, debugLogFilePath);
        try {
          const { verify } = await import('../utils/utils.js');
          const response = await verify('okoeditor', answer);
          const status = response.status;
          const body = await response.json();
          log(`HACK response: ${status} ${JSON.stringify(body)}`, 'tool', false, debugLogFilePath);
          return JSON.stringify({ status, body });
        } catch (error) {
          log(`HACK failed: ${error.message}`, 'error', false, debugLogFilePath);
          return JSON.stringify({ error: error.message });
        }
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

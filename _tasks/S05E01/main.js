import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
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
import { collectorToolDefs, makeCollectorHandlers, MIME_TO_EXT } from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

// --- Load env ---

const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
} else {
  const rootEnvPath = path.join(__dirname, '../../.env');
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}

clearLog(debugLogFilePath);
initTracing('S05E01');

// --- Run directory (unique per execution) ---

const runTs = Math.floor(Date.now() / 1000);
const runDir = path.join(__dirname, 'workspace', String(runTs));
const dir1 = path.join(runDir, '1');
const dir2 = path.join(runDir, '2');
const dir3 = path.join(runDir, '3');

// --- Parse agent file ---

function parseAgent(agentName) {
  const filePath = path.join(__dirname, 'agents', `${agentName}.agent.md`);
  if (!existsSync(filePath)) throw new Error(`Agent file not found: ${agentName}`);
  const raw = readFileSync(filePath, 'utf-8');
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`Invalid agent format: ${agentName}`);
  const frontmatter = match[1];
  const systemPrompt = match[2].trim();
  const modelMatch = frontmatter.match(/model:\s*(.*)/);
  const toolsMatch = frontmatter.match(/tools:\n([\s\S]*?)(?=\n\w+:|$)/);
  const model = modelMatch ? modelMatch[1].trim() : 'openai/gpt-4o-mini';
  const toolNames = toolsMatch
    ? toolsMatch[1].split('\n').map((l) => l.replace(/^\s*-\s*/, '').trim()).filter(Boolean)
    : [];
  return { name: agentName, model, toolNames, systemPrompt };
}

// --- Generic agentic loop ---

async function runAgentLoop({ agentName, model, systemPrompt, toolDefs, handlers, userMessage, maxSteps }) {
  log(`Starting agent: ${agentName}`, 'agent', false, debugLogFilePath);
  let conversation = [{ role: 'user', content: userMessage }];

  return withAgent({ name: agentName, agentId: `${agentName}-${Date.now()}`, task: userMessage }, async () => {
    for (let step = 0; step < maxSteps; step++) {
      advanceTurn();
      log(`--- ${agentName} step ${step + 1}/${maxSteps} ---`, 'agent', false, debugLogFilePath);

      const generation = startGeneration({ model, input: conversation });

      try {
        const data = await chat({ model, input: conversation, tools: toolDefs, instructions: systemPrompt });
        const usage = extractTokenUsage(data);
        generation.end({ output: data, usage });

        const toolCalls = extractToolCalls(data);
        const text = extractText(data);

        if (text) {
          log(`${agentName}: ${text.slice(0, 300)}`, 'agent', false, debugLogFilePath);
          conversation.push({ role: 'assistant', content: text });
        }

        if (toolCalls && toolCalls.length > 0) {
          log(`${agentName} requested ${toolCalls.length} tool call(s)`, 'agent', false, debugLogFilePath);
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
            const handler = handlers[call.name];
            const output = handler
              ? await handler(args)
              : JSON.stringify({ error: `Unknown tool: ${call.name}` });
            toolResults.push({ type: 'function_call_output', call_id: call.call_id, output });
          }
          conversation = [...conversation, ...toolCalls.map((c) => ({ ...c })), ...toolResults];
        } else {
          if (text) return text;
        }
      } catch (error) {
        generation.error(error);
        log(`${agentName} error: ${error.message}`, 'error', false, debugLogFilePath);
        throw error;
      }
    }
    return `Max steps (${maxSteps}) exceeded`;
  });
}

// --- Phase 1: Download signals ---

async function downloadSignals() {
  mkdirSync(dir1, { recursive: true });
  log('=== Phase 1: Downloading signals ===', 'info', false, debugLogFilePath);

  const startRes = await verifyUtil('radiomonitoring', { action: 'start' });
  const startData = await startRes.json();
  log(`Start response: ${JSON.stringify(startData)}`, 'info', false, debugLogFilePath);

  let counter = 0;

  while (true) {
    const listenRes = await verifyUtil('radiomonitoring', { action: 'listen' });
    const listenData = await listenRes.json();

    if (listenData.code !== 100) {
      log(`Signal stream ended (code: ${listenData.code}): ${listenData.message}`, 'info', false, debugLogFilePath);
      break;
    }

    counter++;
    const numStr = String(counter).padStart(2, '0');

    if (listenData.transcription !== undefined) {
      const filePath = path.join(dir1, `${numStr}.txt`);
      writeFileSync(filePath, listenData.transcription, 'utf-8');
      log(`Saved text signal: ${numStr}.txt`, 'info', false, debugLogFilePath);
    } else if (listenData.attachment !== undefined) {
      const ext = MIME_TO_EXT[listenData.meta] || '.bin';
      const filePath = path.join(dir1, `${numStr}${ext}`);
      const buffer = Buffer.from(listenData.attachment, 'base64');
      writeFileSync(filePath, buffer);
      log(`Saved binary signal: ${numStr}${ext} (${buffer.length} bytes, type: ${listenData.meta})`, 'info', false, debugLogFilePath);
    } else {
      log(`Unknown signal format (skipped): ${JSON.stringify(listenData).slice(0, 200)}`, 'info', false, debugLogFilePath);
    }
  }

  log(`Phase 1 complete: downloaded ${counter} signals`, 'info', false, debugLogFilePath);
}

// --- Phase 2: Filter noise ---

async function filterSignals() {
  mkdirSync(dir2, { recursive: true });
  log('=== Phase 2: Filtering noise ===', 'info', false, debugLogFilePath);

  const files = readdirSync(dir1);
  let kept = 0;

  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    const srcPath = path.join(dir1, filename);
    const dstPath = path.join(dir2, filename);

    if (ext === '.txt') {
      const content = readFileSync(srcPath, 'utf-8');

      if (content.trim().length < 5) {
        log(`Skipping empty text: ${filename}`, 'info', false, debugLogFilePath);
        continue;
      }

      const data = await chat({
        model: 'google/gemini-2.5-flash',
        input: [
          {
            role: 'user',
            content:
              `Is the following radio signal text a meaningful message with actual information content, ` +
              `or is it just noise/static/garbled/random text?\n\nText:\n${content.slice(0, 2000)}\n\n` +
              `Reply with only YES (meaningful) or NO (noise).`,
          },
        ],
        instructions: 'You are a radio signal analyst. Reply only YES or NO.',
      });

      const answer = (extractText(data) || '').trim().toUpperCase();
      if (answer.startsWith('YES')) {
        copyFileSync(srcPath, dstPath);
        kept++;
        log(`Kept meaningful text: ${filename}`, 'info', false, debugLogFilePath);
      } else {
        log(`Discarded as noise: ${filename}`, 'info', false, debugLogFilePath);
      }
    } else {
      copyFileSync(srcPath, dstPath);
      kept++;
      log(`Copied binary signal: ${filename}`, 'info', false, debugLogFilePath);
    }
  }

  log(`Phase 2 complete: kept ${kept} of ${files.length} signals`, 'info', false, debugLogFilePath);
}

// --- Phase 3: Agent analysis ---

async function analyzeWithAgents() {
  mkdirSync(dir3, { recursive: true });
  log('=== Phase 3: Agent analysis ===', 'info', false, debugLogFilePath);

  const agent = parseAgent('collector');
  const handlers = makeCollectorHandlers(dir2, dir3, verifyUtil, log, debugLogFilePath);
  const files = readdirSync(dir2);

  return runAgentLoop({
    agentName: 'collector',
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    toolDefs: collectorToolDefs,
    handlers,
    userMessage:
      `You have ${files.length} intercepted radio signal files to analyze. ` +
      `Find the 4 required fields about the city known as "Syjon". ` +
      `Start by calling listFiles to see what's available.`,
    maxSteps: 100,
  });
}

// --- Main ---

async function main() {
  const sessionId = `s05e01-${runTs}`;
  log(`Run ID: ${runTs}, workspace: ${runDir}`, 'info', false, debugLogFilePath);

  try {
    const result = await withTrace({ name: 'S05E01 Radiomonitoring', sessionId }, async () => {
      await downloadSignals();
      await filterSignals();
      return analyzeWithAgents();
    });
    console.log('\nFinal Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await flush();
    await shutdownTracing();
  }
}

main();

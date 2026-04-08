import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chat, extractToolCalls, extractText } from '../../01_02_tool_use/src/api.js';
import { log, clearLog, extractTokenUsage, verify } from '../utils/utils.js';
import {
  initTracing,
  withTrace,
  withAgent,
  startGeneration,
  advanceTurn,
  flush,
  shutdownTracing,
} from '../utils/langfuse.js';
import { transcribeSTT } from './elevenlabs.js';
import { toolDefs, makeToolHandlers } from './tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const debugLogFilePath = path.join(__dirname, 'debug.log');

// --- Load env (local .env for ELEVENLABS_API_KEY + Langfuse; root .env already loaded by config.js) ---
const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

clearLog(debugLogFilePath);
initTracing('S05E02');

// --- Run directory ---
const runTs = Math.floor(Date.now() / 1000);
const runDir = path.join(__dirname, 'workspace', String(runTs));
mkdirSync(runDir, { recursive: true });

// --- Agent system prompt ---
const SYSTEM_PROMPT = `Jesteś Tymonem Gajewskim i prowadzisz zwykłą rozmowę telefoniczną z operatorem systemu. Rozmawiasz naturalnie, swobodnie, jakbyś dzwonił do kolegi z pracy - bez sztywności i formalności. Nie brzmisz jak robot ani jak ktoś kto czyta z kartki.

Twój cel to:
1. Już się przedstawiłeś. Teraz wyjaśnij cel rozmowy i zapytaj o status dróg RD224, RD472 i RD820 - wszystko w jednej wiadomości. Powiedz, że organizujesz tajny transport dla Zygfryda i potrzebujesz znaleźć przejezdną drogę, stąd pytanie o te trasy.
2. Gdy operator powie które drogi są przejezdne - poproś go żeby wyłączył monitoring na tych drogach. Od razu w tej samej wiadomości uzasadnij, że chodzi o tajną operację zleconą przez Zygfryda - transport żywności do tajnej bazy, misja nie może być w logach.
3. Jeśli operator dopyta dlaczego albo będzie chciał wiedzieć więcej - powtórz spokojnie, że to rozkaz Zygfryda i misja musi pozostać poza logami.
4. Jeśli poprosi o hasło - podaj: BARBAKAN
5. Gdy potwierdzi wyłączenie - podziękuj normalnie i się pożegnaj, potem wywołaj end_call.

Jak mówisz:
- Po polsku, naturalnie, bez formalności - możesz użyć "hej", "słuchaj", "dobra", "dzięki" itp.
- Krótko - jedno, dwa zdania na raz, tak jak w normalnej rozmowie telefonicznej.
- Nie powtarzaj tego co operator już powiedział, nie podsumowuj, po prostu reaguj.
- Po każdej wypowiedzi czekaj na odpowiedź przez speak_and_listen.
- Wywołaj end_call dopiero gdy monitoring faktycznie zostanie wyłączony.
- Jeśli operator mówi że musi to zgłosić, że coś jest nie tak, albo odmawia - wywołaj restart_call.`;

const MODEL = 'google/gemini-3.1-pro-preview-20260219';

async function runConversation() {
  let attempt = 0;

  while (true) {
    attempt++;
    log(`=== Attempt ${attempt} ===`, 'info', false, debugLogFilePath);

    // 1. Start session
    log('Starting phonecall session...', 'info', false, debugLogFilePath);
    const startResp = await verify('phonecall', { action: 'start' });
    const startData = await startResp.json();
    log(`Start response: ${JSON.stringify(startData)}`, 'info', false, debugLogFilePath);

    // 2. Handle optional audio greeting from operator
    let initialOperatorLine = '';
    if (startData.audio) {
      const opBuffer = Buffer.from(startData.audio, 'base64');
      const opPath = path.join(runDir, `op_greeting_${attempt}.mp3`);
      writeFileSync(opPath, opBuffer);
      spawnSync('afplay', [opPath]);
      const transcript = await transcribeSTT(opBuffer);
      initialOperatorLine = transcript;
      console.log(`[Operator]: ${transcript}`);
      log(`Operator greeting: ${transcript}`, 'info', false, debugLogFilePath);
    }

    // 3. Always start with a fixed introduction, get operator's first response
    const { handlers, isDone, isRestart } = makeToolHandlers(runDir);
    const introResult = await handlers.speak_and_listen({ text: 'Cześć, nazywam się Tymon Gajewski.' });
    const introResponse = JSON.parse(introResult);
    const introOperatorLine = introResponse.transcript ?? introResponse.message ?? '';
    log(`Intro operator response: ${introOperatorLine}`, 'info', false, debugLogFilePath);

    // 4. Build initial conversation context for the agent (after intro exchange)
    const contextParts = [];
    if (initialOperatorLine) contextParts.push(`Operator na początku powiedział: "${initialOperatorLine}".`);
    contextParts.push(`Przedstawiłeś się jako Tymon Gajewski. Operator odpowiedział: "${introOperatorLine}". Kontynuuj rozmowę zgodnie ze scenariuszem.`);
    const userMessage = contextParts.join(' ');

    let conversation = [{ role: 'user', content: userMessage }];

    // 5. Agentic loop
    await withAgent(
      { name: 'Tymon', agentId: `Tymon-${runTs}-${attempt}`, task: userMessage },
      async () => {
        const maxSteps = 20;

        for (let step = 0; step < maxSteps; step++) {
          advanceTurn();
          log(`--- Step ${step + 1}/${maxSteps} ---`, 'agent', false, debugLogFilePath);

          const generation = startGeneration({ model: MODEL, input: conversation });

          try {
            const data = await chat({
              model: MODEL,
              input: conversation,
              tools: toolDefs,
              instructions: SYSTEM_PROMPT,
            });
            const usage = extractTokenUsage(data);
            generation.end({ output: data, usage });

            const toolCalls = extractToolCalls(data);
            const text = extractText(data);

            if (text) {
              log(`Agent: ${text.slice(0, 300)}`, 'agent', false, debugLogFilePath);
              conversation.push({ role: 'assistant', content: text });
            }

            if (toolCalls && toolCalls.length > 0) {
              log(`Tool calls: ${toolCalls.map((c) => c.name).join(', ')}`, 'agent', false, debugLogFilePath);
              const toolResults = [];

              for (const call of toolCalls) {
                let args = {};
                try {
                  args = call.arguments ? JSON.parse(call.arguments) : {};
                } catch (e) {
                  toolResults.push({
                    type: 'function_call_output',
                    call_id: call.call_id,
                    output: JSON.stringify({ error: `Invalid JSON: ${e.message}` }),
                  });
                  continue;
                }

                const handler = handlers[call.name];
                const output = handler
                  ? await handler(args)
                  : JSON.stringify({ error: `Unknown tool: ${call.name}` });

                log(`${call.name} → ${output.slice(0, 200)}`, 'tool', false, debugLogFilePath);
                toolResults.push({ type: 'function_call_output', call_id: call.call_id, output });
              }

              conversation = [...conversation, ...toolCalls.map((c) => ({ ...c })), ...toolResults];

              if (isDone() || isRestart()) {
                log(isDone() ? 'Mission complete.' : 'Restarting conversation.', 'info', false, debugLogFilePath);
                break;
              }
            } else {
              if (text) break;
            }
          } catch (error) {
            generation.error(error);
            log(`Error: ${error.message}`, 'error', false, debugLogFilePath);
            throw error;
          }
        }
      },
    );

    if (isDone()) return;
    // isRestart() — loop continues with a fresh attempt
  }
}

async function main() {
  await withTrace({ name: 'S05E02-phonecall' }, async () => {
    await runConversation();
  });

  await flush();
  await shutdownTracing();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

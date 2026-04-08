import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateTTS, transcribeSTT } from './elevenlabs.js';
import { verify } from '../utils/utils.js';

export const toolDefs = [
  {
    type: 'function',
    name: 'speak_and_listen',
    description:
      'Wypowiada podany tekst jako Tymon Gajewski (zamienia tekst na mowę i wysyła do operatora), ' +
      'a następnie zwraca transkrypcję odpowiedzi operatora. ' +
      'Użyj tego narzędzia dla każdej kolejnej wypowiedzi w rozmowie.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Tekst do wypowiedzenia po polsku jako Tymon Gajewski.',
        },
      },
      required: ['text'],
    },
  },
  {
    type: 'function',
    name: 'end_call',
    description:
      'Kończy rozmowę telefoniczną. Wywołaj to narzędzie dopiero gdy operator potwierdził ' +
      'wyłączenie monitoringu i misja zakończyła się sukcesem.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    type: 'function',
    name: 'restart_call',
    description:
      'Restartuje rozmowę od początku. Wywołaj gdy operator odmówił współpracy, ' +
      'powiedział że musi to zgłosić, lub gdy rozmowa poszła w złym kierunku.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

export function makeToolHandlers(runDir) {
  let turnCount = 0;
  let done = false;
  let restart = false;

  const playAudio = (buffer, label) => {
    const tmpPath = join(runDir, label);
    writeFileSync(tmpPath, buffer);
    spawnSync('afplay', [tmpPath]);
  };

  const handlers = {
    speak_and_listen: async ({ text }) => {
      turnCount++;
      console.log(`[Tymon]: ${text}`);

      const ttsBuffer = await generateTTS(text);
      playAudio(ttsBuffer, `tymon_turn_${turnCount}.mp3`);

      const base64Audio = ttsBuffer.toString('base64');
      const resp = await verify('phonecall', { audio: base64Audio });
      const data = await resp.json();

      if (data.audio) {
        const opBuffer = Buffer.from(data.audio, 'base64');
        playAudio(opBuffer, `op_turn_${turnCount}.mp3`);
        const transcript = await transcribeSTT(opBuffer);
        console.log(`[Operator]: ${transcript}`);
        return JSON.stringify({ transcript });
      }

      // Text response (flag or error)
      const message = data.message ?? JSON.stringify(data);
      console.log(`[Server]: ${message}`);
      return JSON.stringify({ message });
    },

    end_call: async () => {
      done = true;
      console.log('[System]: Rozmowa zakończona sukcesem.');
      return JSON.stringify({ status: 'DONE' });
    },

    restart_call: async () => {
      restart = true;
      console.log('[System]: Restartuję rozmowę...');
      return JSON.stringify({ status: 'RESTARTING' });
    },
  };

  return { handlers, isDone: () => done, isRestart: () => restart };
}

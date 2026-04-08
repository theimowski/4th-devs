import { AI_API_KEY, EXTRA_API_HEADERS, CHAT_API_BASE_URL } from '../../config.js';

const VOICE_ID = '04BD7Fenyf9Ysq983wrd';
const TTS_MODEL = 'eleven_v3';
const STT_LLM_MODEL = 'google/gemini-3.1-flash-lite-preview-20260303';

// TTS via ElevenLabs REST API
export async function generateTTS(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set');

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      output_format: 'mp3_44100_128',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs TTS failed ${response.status}: ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// STT via OpenRouter Chat Completions (Gemini multimodal)
export async function transcribeSTT(audioBuffer) {
  const base64 = audioBuffer.toString('base64');
  const response = await fetch(`${CHAT_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`,
      ...EXTRA_API_HEADERS,
    },
    body: JSON.stringify({
      model: STT_LLM_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'input_audio', input_audio: { data: base64, format: 'mp3' } },
            { type: 'text', text: 'Przetranscribuj to nagranie audio do tekstu po polsku. Podaj wyłącznie treść transkrypcji, bez żadnych komentarzy.' },
          ],
        },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data?.error?.message ?? `STT failed: ${response.status}`);
  }
  return data.choices?.[0]?.message?.content ?? '';
}

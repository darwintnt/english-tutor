// TTS Service - Unified interface for text-to-speech
// Supports multiple providers: Groq and Cartesia

import {
  CURRENT_PROVIDER,
  getDefaultVoice,
  type TTSProvider,
} from "../config/tts";

export interface TTSResponse {
  audioBlob: Blob;
  audioUrl: string;
}

function getGroqHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function getCartesiaHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Cartesia-Version": "2024-06-10",
  };
}

export async function generateTTS(
  text: string,
  apiKey: string,
  provider: TTSProvider = CURRENT_PROVIDER,
): Promise<TTSResponse> {
  const voice = getDefaultVoice(provider);

  if (provider === "groq") {
    return generateGroqTTS(text, apiKey, voice.id);
  } else {
    return generateCartesiaTTS(text, apiKey, voice.id);
  }
}

async function generateGroqTTS(
  text: string,
  apiKey: string,
  voiceId: string,
): Promise<TTSResponse> {
  console.log("Groq TTS: generating audio for text length", text.length);

  const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "canopylabs/orpheus-v1-english",
      input: text,
      voice: voiceId,
      response_format: "wav",
    }),
  });

  console.log("Groq TTS: response status", response.status);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq TTS error: ${response.status} - ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  console.log("Groq TTS: audio size", arrayBuffer.byteLength, "bytes");

  const audioBlob = new Blob([arrayBuffer], { type: "audio/wav" });
  const audioUrl = URL.createObjectURL(audioBlob);
  console.log("Groq TTS: audioUrl created", audioUrl);

  return { audioBlob, audioUrl };
}

async function generateCartesiaTTS(
  text: string,
  apiKey: string,
  voiceId: string,
): Promise<TTSResponse> {
  const response = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: getCartesiaHeaders(apiKey),
    body: JSON.stringify({
      model_id: "sonic-3.5",
      transcript: text,
      voice: {
        mode: "id",
        id: voiceId,
      },
      language: "en",
      output_format: {
        container: "mp3",
        bit_rate: 128000,
        sample_rate: 44100,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cartesia TTS error: ${response.status} - ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBlob = new Blob([arrayBuffer], { type: "audio/mpeg" });
  const audioUrl = URL.createObjectURL(audioBlob);

  return { audioBlob, audioUrl };
}

export function revokeTTSUrl(url: string) {
  URL.revokeObjectURL(url);
}

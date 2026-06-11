// TTS Service - Unified interface for text-to-speech
// Supports multiple providers: Groq, Cartesia, and Google Cloud TTS

import { API_CONFIG, getTTSVoice } from "../config/api";
import type { TTSProvider } from "../config/tts";

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
  provider?: TTSProvider,
): Promise<TTSResponse> {
  const activeProvider = provider || (API_CONFIG.ttsProvider as TTSProvider);
  const voiceId = getTTSVoice();

  if (activeProvider === "groq") {
    const apiKey = API_CONFIG.groqApiKey;
    if (!apiKey) throw new Error("Groq API key not configured");
    return generateGroqTTS(text, apiKey, voiceId);
  } else if (activeProvider === "cartesia") {
    // Cartesia uses Groq API key for STT/LLM but has its own TTS
    // For now we don't have cartesia API key in config, user must set it in env
    const apiKey = import.meta.env.VITE_CARTESIA_API_KEY;
    if (!apiKey) throw new Error("Cartesia API key not configured");
    return generateCartesiaTTS(text, apiKey, voiceId);
  } else if (activeProvider === "google") {
    const apiKey = API_CONFIG.googleTTSApiKey;
    if (!apiKey) throw new Error("Google TTS API key not configured");
    return generateGoogleTTS(text, apiKey, voiceId);
  }

  throw new Error(`Unknown TTS provider: ${activeProvider}`);
}

async function generateGroqTTS(
  text: string,
  apiKey: string,
  voiceId: string,
): Promise<TTSResponse> {
  console.log("Groq TTS: generating audio for text length", text.length);

  const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: getGroqHeaders(apiKey),
    body: JSON.stringify({
      model: API_CONFIG.groqTTSModel,
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

async function generateGoogleTTS(
  text: string,
  apiKey: string,
  voiceName: string,
): Promise<TTSResponse> {
  console.log("Google TTS: generating audio for text length", text.length);

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: "en-US",
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: 1.0,
        },
      }),
    },
  );

  console.log("Google TTS: response status", response.status);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google TTS error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const audioContent = data.audioContent; // base64 encoded

  if (!audioContent) {
    throw new Error("Google TTS returned no audio content");
  }

  // Decode base64 to ArrayBuffer
  const binaryString = atob(audioContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const arrayBuffer = bytes.buffer;

  console.log("Google TTS: audio size", arrayBuffer.byteLength, "bytes");

  const audioBlob = new Blob([arrayBuffer], { type: "audio/mpeg" });
  const audioUrl = URL.createObjectURL(audioBlob);
  console.log("Google TTS: audioUrl created", audioUrl);

  return { audioBlob, audioUrl };
}

export function revokeTTSUrl(url: string) {
  URL.revokeObjectURL(url);
}
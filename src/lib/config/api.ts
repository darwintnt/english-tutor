// API Configuration - extracted from environment variables
// All these values can be set in .env file

export const API_CONFIG = {
  // Groq API Key
  groqApiKey: import.meta.env.VITE_GROQ_API_KEY as string | undefined,

  // LLM Model (Groq)
  llmModel: (import.meta.env.VITE_LLM_MODEL as string) || 'llama-3.3-70b-versatile',

  // Whisper Model (Groq STT)
  whisperModel: (import.meta.env.VITE_WHISPER_MODEL as string) || 'whisper-large-v3',

  // TTS Provider: 'groq', or 'google'
  ttsProvider: (import.meta.env.VITE_TTS_PROVIDER as 'groq' | 'google') || 'groq',

  // TTS Voice ID per provider
  ttsVoice: {
    groq: (import.meta.env.VITE_GROQ_TTS_VOICE as string) || 'austin',
    google: (import.meta.env.VITE_GOOGLE_TTS_VOICE as string) || 'en-US-Neural2-D',
  },

  // Groq TTS Model
  groqTTSModel: (import.meta.env.VITE_GROQ_TTS_MODEL as string) || 'canopylabs/orpheus-v1-english',

  // Google TTS API Key
  googleTTSApiKey: import.meta.env.VITE_GOOGLE_TTS_API_KEY as string | undefined,
} as const

export function getTTSVoice(): string {
  return API_CONFIG.ttsVoice[API_CONFIG.ttsProvider]
}

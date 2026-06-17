// TTS Provider configuration
// Easy switch between providers: 'groq'

export type TTSProvider = 'groq'

export interface TTSConfig {
  provider: TTSProvider
  speed: number
}

export interface TTSVoice {
  id: string
  name: string
}

export const TTS_VOICES: Record<TTSProvider, TTSVoice[]> = {
  groq: [
    // Groq Orpheus TTS - voices: austin, troy, hannah, nova, sarah
    { id: 'austin', name: 'Austin (Male)' },
    { id: 'troy', name: 'Troy (Male)' },
    { id: 'hannah', name: 'Hannah (Female)' },
  ],
}

export function getDefaultVoice(provider: TTSProvider): TTSVoice {
  return TTS_VOICES[provider][0]
}

// Current active provider - change this to switch TTS engines
export const CURRENT_PROVIDER: TTSProvider = 'groq'

// TTS Provider configuration
// Easy switch between providers: 'groq' or 'cartesia'

export type TTSProvider = 'groq' | 'cartesia'

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
  cartesia: [{ id: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4', name: 'Aristocrat' }],
}

export function getDefaultVoice(provider: TTSProvider): TTSVoice {
  return TTS_VOICES[provider][0]
}

// Current active provider - change this to switch TTS engines
export const CURRENT_PROVIDER: TTSProvider = 'groq'

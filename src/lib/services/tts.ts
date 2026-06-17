// TTS Service - Unified interface for text-to-speech
// Supports multiple providers: Groq, and Google Cloud TTS

import { API_CONFIG, getTTSVoice } from '../config/api'
import type { TTSProvider } from '../config/tts'

export interface TTSResponse {
  audioBlob: Blob
  audioUrl: string
}

const ttsCache = new Map<string, TTSResponse>()

function getGroqHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

export async function generateTTS(text: string, provider?: TTSProvider): Promise<TTSResponse> {
  const cacheKey = text
  const cached = ttsCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const activeProvider = provider || (API_CONFIG.ttsProvider as TTSProvider)
  const voiceId = getTTSVoice()

  let result: TTSResponse

  if (activeProvider === 'groq') {
    const apiKey = API_CONFIG.groqApiKey
    if (!apiKey) throw new Error('Groq API key not configured')
    result = await generateGroqTTS(text, apiKey, voiceId)
  } else if (activeProvider === 'google') {
    const apiKey = API_CONFIG.googleTTSApiKey
    if (!apiKey) throw new Error('Google TTS API key not configured')
    result = await generateGoogleTTS(text, apiKey, voiceId)
  } else {
    throw new Error(`Unknown TTS provider: ${activeProvider}`)
  }

  ttsCache.set(cacheKey, result)
  return result
}

async function generateGroqTTS(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<TTSResponse> {
  console.log('Groq TTS: generating audio for text length', text.length)

  const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
    method: 'POST',
    headers: getGroqHeaders(apiKey),
    body: JSON.stringify({
      model: API_CONFIG.groqTTSModel,
      input: text,
      voice: voiceId,
      response_format: 'wav',
    }),
  })

  console.log('Groq TTS: response status', response.status)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Groq TTS error: ${response.status} - ${error}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  console.log('Groq TTS: audio size', arrayBuffer.byteLength, 'bytes')

  const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' })
  const audioUrl = URL.createObjectURL(audioBlob)
  console.log('Groq TTS: audioUrl created', audioUrl)

  return { audioBlob, audioUrl }
}

async function generateGoogleTTS(
  text: string,
  apiKey: string,
  voiceName: string
): Promise<TTSResponse> {
  console.log('Google TTS: generating audio for text length', text.length)

  const response = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: 'en-US',
          name: voiceName,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1,
        },
      }),
    }
  )

  console.log('Google TTS: response status', response.status)

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google TTS error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  const audioContent = data.audioContent // base64 encoded

  if (!audioContent) {
    throw new Error('Google TTS returned no audio content')
  }

  // Decode base64 to ArrayBuffer
  const binaryString = atob(audioContent)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const arrayBuffer = bytes.buffer

  console.log('Google TTS: audio size', arrayBuffer.byteLength, 'bytes')

  const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
  const audioUrl = URL.createObjectURL(audioBlob)
  console.log('Google TTS: audioUrl created', audioUrl)

  return { audioBlob, audioUrl }
}

export function revokeTTSUrl(url: string) {
  for (const cached of ttsCache.values()) {
    if (cached.audioUrl === url) return
  }
  URL.revokeObjectURL(url)
}

export function clearTTSCache() {
  for (const cached of ttsCache.values()) {
    URL.revokeObjectURL(cached.audioUrl)
  }
  ttsCache.clear()
}

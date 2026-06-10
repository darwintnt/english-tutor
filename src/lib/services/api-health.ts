export interface ApiStatus {
  groq: 'checking' | 'ok' | 'error'
  cartesia: 'checking' | 'ok' | 'error'
}

export async function checkApiHealth(): Promise<ApiStatus> {
  const status: ApiStatus = { groq: 'checking', cartesia: 'checking' }

  // Check Groq
  const groqKey = import.meta.env.VITE_GROQ_API_KEY
  if (!groqKey) {
    status.groq = 'error'
  } else {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${groqKey}` }
      })
      status.groq = response.ok ? 'ok' : 'error'
    } catch {
      status.groq = 'error'
    }
  }

  // Check Cartesia
  const cartesiaKey = import.meta.env.VITE_CARTESIA_API_KEY
  if (!cartesiaKey) {
    status.cartesia = 'error'
  } else {
    try {
      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cartesiaKey}`,
          'Content-Type': 'application/json',
          'Cartesia-Version': '2024-06-10'
        },
        body: JSON.stringify({
          model_id: 'sonic-3.5',
          transcript: 'test',
          voice: { mode: 'id', id: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4' },
          output_format: { container: 'mp3', bit_rate: 128000, sample_rate: 44100 }
        })
      })
      status.cartesia = response.ok ? 'ok' : 'error'
    } catch {
      status.cartesia = 'error'
    }
  }

  return status
}
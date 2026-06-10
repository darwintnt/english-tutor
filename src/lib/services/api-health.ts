export interface ApiStatus {
  groq: 'checking' | 'ok' | 'error'
}

export async function checkApiHealth(): Promise<ApiStatus> {
  const status: ApiStatus = { groq: 'checking' }

  // Check Groq (LLM + STT + TTS all use Groq now)
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

  return status
}
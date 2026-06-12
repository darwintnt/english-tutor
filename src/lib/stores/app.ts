import { writable, derived } from 'svelte/store'
import type { AppScreen, ConversationStatus, Session, Message, Correction, Speed } from '../types'

function createAppStore() {
  const screen = writable<AppScreen>('home')
  const status = writable<ConversationStatus>('idle')
  const speed = writable<Speed>(1.0)
  const currentSession = writable<Session | null>(null)
  const error = writable<string | null>(null)
  const sessionHistory = writable<Session[]>([])

  function startSession() {
    const session: Session = {
      id: crypto.randomUUID(),
      startTime: Date.now(),
      messages: [],
      corrections: [],
      topics: [],
    }
    currentSession.set(session)
    screen.set('conversation')
    status.set('listening')
  }

  function endSession() {
    currentSession.update((s) => (s ? { ...s, endTime: Date.now() } : null))
    currentSession.update((s) => {
      if (s) sessionHistory.update((h) => [s, ...h].slice(0, 10))
      return s
    })
    screen.set('end')
    status.set('idle')
  }

  function goHome() {
    screen.set('home')
    status.set('idle')
    error.set(null)
  }

  function addMessage(message: Omit<Message, 'id' | 'timestamp'>) {
    currentSession.update((s) => {
      if (!s) return s
      return {
        ...s,
        messages: [
          ...s.messages,
          {
            ...message,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
          },
        ],
      }
    })
  }

  function addCorrection(correction: Omit<Correction, 'id' | 'timestamp'>) {
    currentSession.update((s) => {
      if (!s) return s
      return {
        ...s,
        corrections: [
          ...s.corrections,
          {
            ...correction,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
          },
        ],
      }
    })
  }

  function addTopic(topic: string) {
    currentSession.update((s) => {
      if (!s) return s
      if (s.topics.includes(topic)) return s
      return { ...s, topics: [...s.topics, topic] }
    })
  }

  return {
    screen,
    status,
    speed,
    currentSession,
    error,
    sessionHistory,
    startSession,
    endSession,
    goHome,
    addMessage,
    addCorrection,
    addTopic,
    setStatus: status.set,
    setError: error.set,
  }
}

export const appStore = createAppStore()

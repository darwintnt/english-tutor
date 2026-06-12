import { writable } from 'svelte/store'

interface UsageLimits {
  whisper: { used: number; max: number }
  llm: { used: number; max: number }
  tts: { used: number; max: number }
}

interface UsageStore {
  daily: UsageLimits
  lastReset: Date
}

const DAILY_LIMITS = {
  whisper: 2000,
  llm: 1000,
  tts: 100,
}

function createUsageStore() {
  // Reset if it's a new day
  function getStoredUsage(): UsageStore {
    const stored = localStorage.getItem('groq_usage')
    if (stored) {
      const data = JSON.parse(stored)
      const lastReset = new Date(data.lastReset)
      const now = new Date()
      // Reset at midnight
      if (lastReset.toDateString() !== now.toDateString()) {
        return {
          daily: {
            whisper: { used: 0, max: DAILY_LIMITS.whisper },
            llm: { used: 0, max: DAILY_LIMITS.llm },
            tts: { used: 0, max: DAILY_LIMITS.tts },
          },
          lastReset: now,
        }
      }
      return data
    }
    return {
      daily: {
        whisper: { used: 0, max: DAILY_LIMITS.whisper },
        llm: { used: 0, max: DAILY_LIMITS.llm },
        tts: { used: 0, max: DAILY_LIMITS.tts },
      },
      lastReset: new Date(),
    }
  }

  const { subscribe, set, update } = writable<UsageStore>(getStoredUsage())

  function save(u: UsageStore) {
    localStorage.setItem('groq_usage', JSON.stringify(u))
    set(u)
  }

  return {
    subscribe,
    trackWhisper: () =>
      update((u) => {
        u.daily.whisper.used++
        save(u)
        return u
      }),
    trackLLM: () =>
      update((u) => {
        u.daily.llm.used++
        save(u)
        return u
      }),
    trackTTS: () =>
      update((u) => {
        u.daily.tts.used++
        save(u)
        return u
      }),
    reset: () => {
      const now = new Date()
      const u: UsageStore = {
        daily: {
          whisper: { used: 0, max: DAILY_LIMITS.whisper },
          llm: { used: 0, max: DAILY_LIMITS.llm },
          tts: { used: 0, max: DAILY_LIMITS.tts },
        },
        lastReset: now,
      }
      save(u)
    },
  }
}

export const usageStore = createUsageStore()

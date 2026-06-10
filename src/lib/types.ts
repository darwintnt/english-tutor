export type AppScreen = 'home' | 'conversation' | 'end'

export type ConversationStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface Correction {
  id: string
  original: string
  corrected: string
  explanation: string
  timestamp: number
}

export interface Session {
  id: string
  startTime: number
  endTime?: number
  messages: Message[]
  corrections: Correction[]
  topics: string[]
}

export interface AppState {
  screen: AppScreen
  status: ConversationStatus
  speed: number // 0.75, 1.0, 1.25, 1.5
  currentSession: Session | null
  error: string | null
}

export const SPEEDS = [0.75, 1.0, 1.25, 1.5] as const
export type Speed = typeof SPEEDS[number]

export const SPEED_LABELS: Record<Speed, string> = {
  0.75: 'Slow',
  1.0: 'Normal',
  1.25: 'Fast',
  1.5: 'Extra Fast'
}
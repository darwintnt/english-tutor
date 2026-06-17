// Auth store - Simple PIN authentication from env var
// Session expires after 1 hour

import { writable } from 'svelte/store'

const SESSION_DURATION = 60 * 60 * 1000 // 1 hour in ms
const STORED_PIN_HASH_KEY = 'auth_pin_hash'

interface AuthState {
  isAuthenticated: boolean
  sessionExpiry: number | null
}

function createAuthStore() {
  const configuredPinHash = import.meta.env.VITE_AUTH_PIN
    ? hashPinSync(import.meta.env.VITE_AUTH_PIN as string)
    : null

  function getInitialState(): AuthState {
    const sessionExpiry = sessionStorage.getItem('auth_session_expiry')
    const now = Date.now()

    if (configuredPinHash && sessionExpiry) {
      const expiry = Number.parseInt(sessionExpiry, 10)
      if (now < expiry) {
        return { isAuthenticated: true, sessionExpiry: expiry }
      }
    }

    return { isAuthenticated: false, sessionExpiry: null }
  }

  const { subscribe, set, update } = writable<AuthState>(getInitialState())

  return {
    subscribe,

    // Verify PIN against env var
    verifyPin(pin: string): boolean {
      if (!configuredPinHash) {
        console.error('VITE_AUTH_PIN not configured')
        return false
      }

      const inputHash = hashPinSync(pin)
      if (inputHash === configuredPinHash) {
        const expiry = Date.now() + SESSION_DURATION
        sessionStorage.setItem('auth_session_expiry', expiry.toString())

        // Store hash to allow re-auth without exposing PIN
        localStorage.setItem(STORED_PIN_HASH_KEY, inputHash)

        update((s) => ({
          ...s,
          isAuthenticated: true,
          sessionExpiry: expiry,
        }))
        return true
      }
      return false
    },

    // Lock the session
    lock() {
      sessionStorage.removeItem('auth_session_expiry')
      set({ isAuthenticated: false, sessionExpiry: null })
    },

    // Clear stored hash (logout)
    logout() {
      localStorage.removeItem(STORED_PIN_HASH_KEY)
      sessionStorage.removeItem('auth_session_expiry')
      set({ isAuthenticated: false, sessionExpiry: null })
    },

    // Check if auth is configured
    isConfigured(): boolean {
      return !!configuredPinHash
    },
  }
}

function hashPinSync(pin: string): string {
  // Simple hash for comparison - PIN never stored in plain text
  // Using a mix of char codes to create a deterministic hash
  const salt = 'english-tutor-auth-v1'
  let hash = 0
  const combined = pin + salt

  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }

  // Make it hexadecimal
  const hexHash = Math.abs(hash).toString(16)
  // Pad to ensure consistent length
  return hexHash.padStart(8, '0').repeat(4).slice(0, 32)
}

export const authStore = createAuthStore()

<script lang="ts">
  import { onMount } from 'svelte'
  import { appStore } from '../stores/app'
  import type { Speed } from '../types'
  import { SPEEDS, SPEED_LABELS } from '../types'
  import { checkApiHealth, type ApiStatus } from '../services/api-health'
  import { usageStore } from '../stores/usage'

  const { speed, sessionHistory } = appStore

  let showHistory = false
  let apiStatus: ApiStatus = { groq: 'checking' }

  onMount(async () => {
    apiStatus = await checkApiHealth()
  })

  function getStatusDot(status: ApiStatus['groq']) {
    switch (status) {
      case 'ok': return 'bg-emerald-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-yellow-500'
    }
  }

  function isAllOk(status: ApiStatus) {
    return status.groq === 'ok'
  }

  function isAnyError(status: ApiStatus) {
    return status.groq === 'error'
  }

  function getMostCriticalUsage(usage: typeof $usageStore) {
    const items = [
      { name: 'Whisper STT', used: usage.daily.whisper.used, max: usage.daily.whisper.max },
      { name: 'LLaMA LLM', used: usage.daily.llm.used, max: usage.daily.llm.max },
      { name: 'Orpheus TTS', used: usage.daily.tts.used, max: usage.daily.tts.max }
    ]
    return items.reduce((a, b) => (a.used / a.max > b.used / b.max ? a : b))
  }

  function getProgressColor(pct: number) {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 80) return 'bg-yellow-500'
    return 'bg-emerald-500'
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
  <main class="flex-1 flex flex-col items-center justify-center p-6 gap-8">
    <!-- Header -->
    <div class="text-center space-y-1">
      <h1 class="text-2xl font-semibold tracking-tight">English Coach</h1>
      <p class="text-sm text-zinc-500">Your personal AI conversation tutor</p>
    </div>

    <!-- API Status Card -->
    <div class="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full {getStatusDot(apiStatus.groq)}"></div>
          <span class="text-sm text-zinc-400">Groq API</span>
        </div>
        <span class="text-xs {isAllOk(apiStatus) ? 'text-emerald-500' : isAnyError(apiStatus) ? 'text-red-500' : 'text-yellow-500'}">
          {#if isAllOk(apiStatus)}
            Connected
          {:else if isAnyError(apiStatus)}
            Check API key
          {:else}
            Checking...
          {/if}
        </span>
      </div>
    </div>

    <!-- Usage Progress -->
    {#if $usageStore}
      {@const critical = getMostCriticalUsage($usageStore)}
      {@const pct = Math.round((critical.used / critical.max) * 100)}
      <div class="w-full max-w-sm space-y-2">
        <div class="flex justify-between text-xs text-zinc-500">
          <span>{critical.name}</span>
          <span>{critical.used}/{critical.max}</span>
        </div>
        <div class="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500 {getProgressColor(pct)}"
            style="width: {pct}%"
          ></div>
        </div>
      </div>
    {/if}

    <!-- Start Button -->
    <div class="w-full max-w-sm space-y-3">
      <button
        class="w-full h-14 bg-zinc-50 text-zinc-900 font-medium rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        onclick={() => appStore.startSession()}
        disabled={isAnyError(apiStatus)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" x2="12" y1="19" y2="22"/>
        </svg>
        Start Conversation
      </button>

      {#if isAnyError(apiStatus)}
        <p class="text-xs text-red-500 text-center">
          Configure your API keys in the .env file to start
        </p>
      {/if}
    </div>

    <!-- History Toggle -->
    {#if $sessionHistory.length > 0}
      <button
        class="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        onclick={() => showHistory = !showHistory}
      >
        {showHistory ? 'Hide' : 'Show'} History ({$sessionHistory.length})
      </button>

      {#if showHistory}
        <div class="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
          {#each $sessionHistory as session}
            <div class="flex justify-between items-center py-2 border-b border-zinc-800 last:border-0">
              <span class="text-sm text-zinc-300">{new Date(session.startTime).toLocaleDateString()}</span>
              <span class="text-xs text-zinc-600">{session.messages.length} msgs</span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </main>

  <!-- Speed Selector - Bottom Fixed -->
  <footer class="p-6 border-t border-zinc-900">
    <div class="max-w-sm mx-auto space-y-3">
      <p class="text-xs text-zinc-600 uppercase tracking-wider text-center">Speech Speed</p>
      <div class="flex bg-zinc-900 border border-zinc-800 rounded-lg p-1">
        {#each SPEEDS as s}
          <button
            class="flex-1 py-2.5 text-sm font-medium rounded-md transition-all {$speed === s ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-500 hover:text-zinc-300'}"
            onclick={() => speed.set(s as Speed)}
          >
            {SPEED_LABELS[s]}
          </button>
        {/each}
      </div>
    </div>
  </footer>
</div>
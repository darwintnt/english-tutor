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

  function getStatusColor(status: ApiStatus['groq']) {
    switch (status) {
      case 'ok': return 'bg-green-500'
      case 'error': return 'bg-red-500'
      default: return 'bg-yellow-500 animate-pulse'
    }
  }

  function isAllOk(status: ApiStatus) {
    return status.groq === 'ok'
  }

  function isAnyError(status: ApiStatus) {
    return status.groq === 'error'
  }

  // Get the most critical usage (lowest percentage remaining)
  function getMostCriticalUsage(usage: typeof $usageStore) {
    const items = [
      { name: 'Whisper STT', used: usage.daily.whisper.used, max: usage.daily.whisper.max },
      { name: 'LLaMA LLM', used: usage.daily.llm.used, max: usage.daily.llm.max },
      { name: 'Orpheus TTS', used: usage.daily.tts.used, max: usage.daily.tts.max }
    ]
    return items.reduce((a, b) => (a.used / a.max > b.used / b.max ? a : b))
  }

  function getBarColor(pct: number) {
    if (pct >= 90) return 'bg-red-500'
    if (pct >= 80) return 'bg-yellow-500'
    return 'bg-green-500'
  }
</script>

<div class="flex flex-col items-center justify-center min-h-dvh p-8 gap-6">
  <div class="text-center">
    <h1 class="text-4xl font-bold text-white mb-2">English Coach</h1>
    <p class="text-gray-400">Your personal AI conversation tutor</p>
  </div>

  <!-- API Status Indicator -->
  <div class="flex flex-col items-center gap-2 p-4 bg-white/5 rounded-2xl">
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full {getStatusColor(apiStatus.groq)}"></div>
        <span class="text-xs text-gray-400">Groq (LLM + STT + TTS)</span>
      </div>
    </div>
    <div class="text-xs {isAllOk(apiStatus) ? 'text-green-400' : isAnyError(apiStatus) ? 'text-red-400' : 'text-yellow-400'}">
      {#if isAllOk(apiStatus)}
        ✓ Connected
      {:else if isAnyError(apiStatus)}
        ⚠ Check API key
      {:else}
        Checking...
      {/if}
    </div>
  </div>

  <!-- Usage Bar -->
  {#if $usageStore}
    {@const critical = getMostCriticalUsage($usageStore)}
    {@const pct = Math.round((critical.used / critical.max) * 100)}
    <div class="w-full max-w-xs flex flex-col gap-1">
      <div class="flex justify-between text-xs text-gray-400">
        <span>{critical.name}</span>
        <span>{critical.used} / {critical.max} ({pct}%)</span>
      </div>
      <div class="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-300 {getBarColor(pct)}"
          style="width: {pct}%"
        ></div>
      </div>
    </div>
  {/if}

  <div class="flex flex-col items-center gap-4 w-full max-w-xs">
    <button
      class="w-full py-5 px-8 text-xl font-semibold bg-gradient-to-br from-indigo-500 to-purple-500 text-white rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={() => appStore.startSession()}
      disabled={isAnyError(apiStatus)}
    >
      <span>🎙️</span>
      Start Conversation
    </button>

    {#if isAnyError(apiStatus)}
      <p class="text-xs text-red-400 text-center px-4">
        Configure your API keys in the .env file to start chatting
      </p>
    {/if}

    {#if $sessionHistory.length > 0}
      <button
        class="text-indigo-400 border border-indigo-400 px-6 py-3 rounded-xl text-sm"
        onclick={() => showHistory = !showHistory}
      >
        {showHistory ? 'Hide' : 'Show'} History ({$sessionHistory.length})
      </button>

      {#if showHistory}
        <div class="w-full space-y-2">
          {#each $sessionHistory as session}
            <div class="flex justify-between items-center p-3 rounded-lg bg-white/5 text-sm">
              <span class="text-white">{new Date(session.startTime).toLocaleDateString()}</span>
              <span class="text-gray-500">{session.messages.length} messages · {session.corrections.length} corrections</span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <div class="fixed bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
    <label class="text-xs text-gray-500 uppercase tracking-wider">Speech Speed</label>
    <div class="flex gap-1 bg-white/10 p-1 rounded-xl">
      {#each SPEEDS as s}
        <button
          class="px-3 py-2 text-sm rounded-lg transition-all {$speed === s ? 'bg-indigo-500 text-white' : 'text-gray-400'}"
          onclick={() => speed.set(s as Speed)}
        >
          {SPEED_LABELS[s]}
        </button>
      {/each}
    </div>
  </div>
</div>
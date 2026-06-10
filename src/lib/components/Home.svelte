<script lang="ts">
  import { appStore } from '../stores/app'
  import type { Speed } from '../types'
  import { SPEEDS, SPEED_LABELS } from '../types'

  const { speed, sessionHistory } = appStore

  let showHistory = false
</script>

<div class="flex flex-col items-center justify-center min-h-dvh p-8 gap-8">
  <div class="text-center">
    <h1 class="text-4xl font-bold text-white mb-2">English Coach</h1>
    <p class="text-gray-400">Your personal AI conversation tutor</p>
  </div>

  <div class="flex flex-col items-center gap-4 w-full max-w-xs">
    <button
      class="w-full py-5 px-8 text-xl font-semibold bg-gradient-to-br from-indigo-500 to-purple-500 text-white rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      onclick={() => appStore.startSession()}
    >
      <span>🎙️</span>
      Start Conversation
    </button>

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
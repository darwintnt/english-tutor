<script lang="ts">
  import { appStore } from '../stores/app'

  const { currentSession, goHome, startSession } = appStore

  $: corrections = $currentSession?.corrections ?? []
  $: messageCount = $currentSession?.messages.length ?? 0
  $: duration = $currentSession
    ? Math.round((($currentSession.endTime ?? Date.now()) - $currentSession.startTime) / 1000 / 60)
    : 0
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
  <main class="flex-1 flex flex-col items-center justify-center p-6">
    <div class="w-full max-w-md space-y-8">
      <!-- Header -->
      <div class="text-center space-y-2">
        <div
          class="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-zinc-900 border border-zinc-800 mb-4"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-emerald-500"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h1 class="text-2xl font-semibold tracking-tight">Session Complete</h1>
        <p class="text-sm text-zinc-500">Great practice session!</p>
      </div>

      <!-- Stats -->
      <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <div class="grid grid-cols-3 gap-4">
          <div class="text-center">
            <p class="text-3xl font-semibold text-zinc-50">{messageCount}</p>
            <p class="text-xs text-zinc-600 mt-1">Messages</p>
          </div>
          <div class="text-center">
            <p
              class="text-3xl font-semibold {corrections.length > 0
                ? 'text-red-500'
                : 'text-zinc-50'}"
            >
              {corrections.length}
            </p>
            <p class="text-xs text-zinc-600 mt-1">Corrections</p>
          </div>
          <div class="text-center">
            <p class="text-3xl font-semibold text-zinc-50">{duration}m</p>
            <p class="text-xs text-zinc-600 mt-1">Duration</p>
          </div>
        </div>
      </div>

      <!-- Corrections -->
      {#if corrections.length > 0}
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <h2 class="text-sm font-medium text-zinc-400">Corrections from this session</h2>
          <div class="space-y-3">
            {#each corrections as correction}
              <div class="p-4 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
                <p class="text-sm text-zinc-500 italic">"{correction.original}"</p>
                <p class="text-sm text-emerald-500 font-medium">{correction.corrected}</p>
                <p class="text-xs text-zinc-600">{correction.explanation}</p>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
          <div
            class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 mb-3"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="text-emerald-500"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p class="text-sm text-emerald-500 font-medium">No corrections this time</p>
          <p class="text-xs text-zinc-600 mt-1">Keep up the great work!</p>
        </div>
      {/if}

      <!-- Actions -->
      <div class="flex flex-col gap-3">
        <button
          class="w-full h-12 bg-zinc-50 text-zinc-900 font-medium rounded-xl hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-zinc-950 transition-all"
          onclick={() => startSession()}
        >
          New Conversation
        </button>
        <button
          class="w-full h-11 font-medium rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-zinc-800 transition-all"
          onclick={() => goHome()}
        >
          Home
        </button>
      </div>
    </div>
  </main>
</div>

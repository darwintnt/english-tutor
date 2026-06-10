<script lang="ts">
  import { appStore } from '../stores/app'

  const { currentSession, goHome, startSession } = appStore

  $: corrections = $currentSession?.corrections ?? []
  $: topics = $currentSession?.topics ?? []
  $: messageCount = $currentSession?.messages.length ?? 0
  $: duration = $currentSession
    ? Math.round((($currentSession.endTime ?? Date.now()) - $currentSession.startTime) / 1000 / 60)
    : 0
</script>

<div class="flex items-center justify-center min-h-dvh p-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
  <div class="w-full max-w-md bg-white/5 rounded-3xl p-8">
    <h1 class="text-center text-white text-2xl font-bold mb-6">Session Complete</h1>

    <div class="flex justify-around mb-6 pb-6 border-b border-white/10">
      <div class="text-center">
        <span class="block text-3xl font-bold text-indigo-400">{messageCount}</span>
        <span class="text-xs text-gray-500 uppercase">messages</span>
      </div>
      <div class="text-center">
        <span class="block text-3xl font-bold text-indigo-400">{corrections.length}</span>
        <span class="text-xs text-gray-500 uppercase">corrections</span>
      </div>
      <div class="text-center">
        <span class="block text-3xl font-bold text-indigo-400">{duration}m</span>
        <span class="text-xs text-gray-500 uppercase">duration</span>
      </div>
    </div>

    {#if corrections.length > 0}
      <div class="mb-6">
        <h2 class="text-sm text-gray-400 mb-4">Corrections from this session</h2>
        <div class="space-y-3">
          {#each corrections as correction}
            <div class="bg-white/5 rounded-xl p-4">
              <div class="text-red-400 italic mb-2">"{correction.original}"</div>
              <div class="text-green-400 mb-2">{correction.corrected}</div>
              <div class="text-sm text-gray-500">{correction.explanation}</div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="text-center py-8 text-green-400">
        <p>No corrections this time — great job!</p>
      </div>
    {/if}

    <div class="flex flex-col gap-3">
      <button
        class="w-full py-4 rounded-xl font-semibold text-white bg-gradient-to-br from-indigo-500 to-purple-500"
        onclick={() => startSession()}
      >
        New Conversation
      </button>
      <button
        class="w-full py-3 rounded-xl text-gray-400 border border-white/20 text-sm"
        onclick={() => goHome()}
      >
        Home
      </button>
    </div>
  </div>
</div>
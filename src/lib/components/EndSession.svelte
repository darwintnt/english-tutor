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

<div class="end-screen">
  <div class="card">
    <h1>Session Complete</h1>

    <div class="stats">
      <div class="stat">
        <span class="value">{messageCount}</span>
        <span class="label">messages</span>
      </div>
      <div class="stat">
        <span class="value">{corrections.length}</span>
        <span class="label">corrections</span>
      </div>
      <div class="stat">
        <span class="value">{duration}m</span>
        <span class="label">duration</span>
      </div>
    </div>

    {#if corrections.length > 0}
      <div class="corrections">
        <h2>Corrections from this session</h2>
        {#each corrections as correction}
          <div class="correction">
            <div class="original">"{correction.original}"</div>
            <div class="corrected">{correction.corrected}</div>
            <div class="explanation">{correction.explanation}</div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="no-corrections">
        <p>No corrections this time — great job!</p>
      </div>
    {/if}

    <div class="actions">
      <button class="primary" onclick={() => startSession()}>
        New Conversation
      </button>
      <button class="secondary" onclick={() => goHome()}>
        Home
      </button>
    </div>
  </div>
</div>

<style>
  .end-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: 2rem;
    padding-top: max(2rem, env(safe-area-inset-top));
    padding-bottom: max(2rem, env(safe-area-inset-bottom));
  }

  .card {
    width: 100%;
    max-width: 400px;
    background: rgba(255,255,255,0.05);
    border-radius: 1.5rem;
    padding: 2rem;
  }

  h1 {
    text-align: center;
    color: #fff;
    margin: 0 0 1.5rem;
  }

  h2 {
    font-size: 1rem;
    color: #888;
    margin: 0 0 1rem;
  }

  .stats {
    display: flex;
    justify-content: space-around;
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.1);
  }

  .stat {
    text-align: center;
  }

  .value {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    color: #6366f1;
  }

  .label {
    font-size: 0.75rem;
    color: #666;
    text-transform: uppercase;
  }

  .corrections {
    margin-bottom: 1.5rem;
  }

  .correction {
    background: rgba(255,255,255,0.05);
    border-radius: 0.75rem;
    padding: 1rem;
    margin-bottom: 0.75rem;
  }

  .original {
    color: #ef4444;
    font-style: italic;
    margin-bottom: 0.5rem;
  }

  .corrected {
    color: #22c55e;
    margin-bottom: 0.5rem;
  }

  .explanation {
    font-size: 0.85rem;
    color: #888;
  }

  .no-corrections {
    text-align: center;
    padding: 2rem;
    color: #22c55e;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .primary {
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border: none;
    padding: 1rem;
    border-radius: 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }

  .secondary {
    background: transparent;
    color: #888;
    border: 1px solid rgba(255,255,255,0.2);
    padding: 0.75rem;
    border-radius: 0.75rem;
    font-size: 0.9rem;
    cursor: pointer;
  }
</style>
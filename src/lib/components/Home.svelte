<script lang="ts">
  import { appStore } from '../stores/app'
  import type { Speed } from '../types'
  import { SPEEDS, SPEED_LABELS } from '../types'

  const { speed, sessionHistory } = appStore

  let showHistory = false
</script>

<div class="home">
  <div class="header">
    <h1>English Coach</h1>
    <p class="tagline">Your personal AI conversation tutor</p>
  </div>

  <div class="content">
    <button class="start-btn" onclick={() => appStore.startSession()}>
      <span class="icon">🎙️</span>
      Start Conversation
    </button>

    {#if $sessionHistory.length > 0}
      <button class="secondary-btn" onclick={() => showHistory = !showHistory}>
        {showHistory ? 'Hide' : 'Show'} History ({$sessionHistory.length})
      </button>

      {#if showHistory}
        <div class="history">
          {#each $sessionHistory as session}
            <div class="history-item">
              <span class="date">{new Date(session.startTime).toLocaleDateString()}</span>
              <span class="stats">{session.messages.length} messages · {session.corrections.length} corrections</span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <div class="speed-control">
    <label for="speed">Speech Speed</label>
    <div class="speed-buttons">
      {#each SPEEDS as s}
        <button
          class="speed-btn"
          class:active={$speed === s}
          onclick={() => speed.set(s as Speed)}
        >
          {SPEED_LABELS[s]}
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: 2rem;
    gap: 2rem;
  }

  .header {
    text-align: center;
  }

  h1 {
    font-size: 2.5rem;
    margin: 0;
    color: #fff;
  }

  .tagline {
    color: #888;
    margin: 0.5rem 0 0;
  }

  .content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: 100%;
    max-width: 300px;
  }

  .start-btn {
    width: 100%;
    padding: 1.25rem 2rem;
    font-size: 1.25rem;
    font-weight: 600;
    background: linear-gradient(135deg, #6366f1, #8b5cf6);
    color: white;
    border: none;
    border-radius: 1rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .start-btn:active {
    transform: scale(0.98);
  }

  .secondary-btn {
    background: transparent;
    color: #6366f1;
    border: 1px solid #6366f1;
    padding: 0.75rem 1.5rem;
    border-radius: 0.75rem;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .history {
    width: 100%;
    margin-top: 0.5rem;
  }

  .history-item {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem;
    background: rgba(255,255,255,0.05);
    border-radius: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }

  .date { color: #fff; }
  .stats { color: #888; }

  .speed-control {
    position: fixed;
    bottom: 2rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .speed-control label {
    font-size: 0.75rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .speed-buttons {
    display: flex;
    gap: 0.25rem;
    background: rgba(255,255,255,0.1);
    padding: 0.25rem;
    border-radius: 0.75rem;
  }

  .speed-btn {
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    color: #888;
    font-size: 0.8rem;
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.2s;
  }

  .speed-btn.active {
    background: #6366f1;
    color: white;
  }

  .icon {
    font-size: 1.5rem;
  }
</style>
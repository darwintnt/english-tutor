<script lang="ts">
  import { appStore } from './lib/stores/app'
  import Home from './lib/components/Home.svelte'
  import Conversation from './lib/components/Conversation.svelte'
  import EndSession from './lib/components/EndSession.svelte'

  const { screen } = appStore
</script>

<div class="app">
  {#if $screen === 'home'}
    <Home />
  {:else if $screen === 'conversation'}
    <Conversation />
  {:else if $screen === 'end'}
    <EndSession />
  {/if}
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #1a1a2e;
    color: #fff;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .app {
    width: 100%;
    min-height: 100dvh;
  }
</style>
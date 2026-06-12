<script lang="ts">
  import { appStore } from './lib/stores/app'
  import { authStore } from './lib/stores/auth'
  import Home from './lib/components/Home.svelte'
  import Conversation from './lib/components/Conversation.svelte'
  import EndSession from './lib/components/EndSession.svelte'

  const { screen } = appStore
</script>

<div class="app">
  {#if !$authStore.isAuthenticated}
    {#await import('./lib/components/AuthScreen.svelte') then module}
      <svelte:component this={module.default} />
    {/await}
  {:else if $screen === 'home'}
    <Home />
  {:else if $screen === 'conversation'}
    <Conversation />
  {:else if $screen === 'end'}
    <EndSession />
  {/if}
</div>

<style>
  .app {
    width: 100%;
    min-height: 100dvh;
    background: #09090b;
  }
</style>
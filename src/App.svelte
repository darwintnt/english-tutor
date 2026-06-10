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
  .app {
    width: 100%;
    min-height: 100dvh;
  }
</style>
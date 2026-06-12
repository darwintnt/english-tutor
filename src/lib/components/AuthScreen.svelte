<script lang="ts">
  import { authStore } from '../stores/auth'

  let pin = ''
  let error = ''
  let loading = false

  function handlePinInput(e: Event) {
    const target = e.target as HTMLInputElement
    pin = target.value.replace(/\D/g, '').slice(0, 6)
    target.value = pin
  }

  function handleSubmit() {
    if (pin.length < 4) {
      error = 'Enter at least 4 digits'
      return
    }

    if (!authStore.isConfigured()) {
      error = 'Auth not configured on server'
      return
    }

    loading = true
    error = ''

    const success = authStore.verifyPin(pin)
    if (!success) {
      error = 'Incorrect PIN'
    }
    loading = false
    pin = ''
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && pin.length >= 4) {
      handleSubmit()
    }
  }
</script>

<div class="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-4">
  <!-- Dot grid with radial fade -->
  <div class="absolute inset-0 bg-[radial-gradient(#27272a_1px,transparent_1px)] bg-[size:16px_16px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_80%,transparent_100%)]"></div>

  <div class="relative w-full max-w-sm space-y-6">
    <!-- Logo/Title -->
    <div class="text-center space-y-2">
      <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-400">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
          <path d="M2 12h20"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
      </div>
      <h1 class="text-2xl font-semibold tracking-tight">English Coach</h1>
      <p class="text-sm text-zinc-500">Enter your PIN to continue</p>
    </div>

    <!-- Card -->
    <div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
      <div class="space-y-2">
        <label class="text-sm font-medium text-zinc-400" for="pin">PIN</label>
        <input
          id="pin"
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="6"
          value={pin}
          oninput={handlePinInput}
          onkeydown={handleKeydown}
          class="w-full h-12 px-4 text-center text-2xl tracking-[0.5em] bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700 focus:border-zinc-700 transition-all"
          placeholder="••••••"
          autofocus
        />
      </div>

      {#if error}
        <p class="text-sm text-red-500 text-center">{error}</p>
      {/if}

      <button
        onclick={handleSubmit}
        disabled={loading || pin.length < 4}
        class="w-full h-11 bg-zinc-50 text-zinc-900 font-medium rounded-lg hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loading ? 'Verifying...' : 'Unlock'}
      </button>
    </div>

    <!-- Footer -->
    <p class="text-center text-xs text-zinc-600">
      Protected access
    </p>
  </div>
</div>
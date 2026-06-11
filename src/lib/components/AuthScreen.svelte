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

<div class="flex flex-col items-center justify-center min-h-dvh p-8 bg-[#1a1a2e]">
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold text-white mb-2">English Coach</h1>
    <p class="text-gray-400 text-sm">Enter your PIN to continue</p>
  </div>

  <div class="w-full max-w-xs space-y-4">
    <div>
      <label class="text-xs text-gray-400 uppercase tracking-wider block mb-2 text-left">PIN</label>
      <input
        type="password"
        inputmode="numeric"
        pattern="[0-9]*"
        maxlength="6"
        value={pin}
        oninput={handlePinInput}
        onkeydown={handleKeydown}
        class="w-full p-4 text-center text-2xl tracking-widest bg-white/10 text-white rounded-xl border border-white/20 focus:border-indigo-500 focus:outline-none"
        placeholder="••••"
        autofocus
      />
    </div>

    {#if error}
      <p class="text-red-400 text-sm text-center">{error}</p>
    {/if}

    <button
      onclick={handleSubmit}
      disabled={loading || pin.length < 4}
      class="w-full py-4 bg-indigo-500 text-white rounded-xl font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
    >
      {loading ? 'Verifying...' : 'Unlock'}
    </button>
  </div>

  <p class="text-gray-600 text-xs mt-8">
    Protected access
  </p>
</div>
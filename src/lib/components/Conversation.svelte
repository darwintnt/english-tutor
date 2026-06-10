<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte'
  import { appStore } from '../stores/app'
  import { get } from 'svelte/store'
  import type { Message } from '../types'
  import { generateTTS, revokeTTSUrl } from '../services/tts'
  import { usageStore } from '../stores/usage'

  const { currentSession, status, speed, setStatus, addMessage, setError, error } = appStore

  let conversation: Message[] = []
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let isProcessingTurn = false
  let micStream: MediaStream | null = null
  let currentAudio: HTMLAudioElement | null = null
  let messagesContainer: HTMLDivElement | null = null
  let pendingTTS: { text: string; audioUrl: string } | null = null
  let isPlayingTTS = false
  let isRecording = false
  let sessionActive = false

  // Detect iOS to show TTS play button instead of auto-play
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream

  $: conversation = $currentSession?.messages ?? []

  // Auto-scroll to bottom when conversation updates
  afterUpdate(() => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  })

  onMount(() => {
    initAudio()
  })

  onDestroy(() => {
    cleanup()
  })

  async function initAudio() {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      })

      let mimeType = 'audio/aac'
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      } else if (!MediaRecorder.isTypeSupported('audio/aac')) {
        mimeType = ''
      }

      mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined)

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }
      mediaRecorder.onstop = processAudio

      sessionActive = true
      setStatus('idle')
    } catch (err) {
      setError('Microphone access denied.')
      setStatus('error')
    }
  }

  function toggleRecording() {
    if (isProcessingTurn || isPlayingTTS) return

    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  function startRecording() {
    if (!mediaRecorder || !sessionActive || isRecording) return
    audioChunks = []
    isRecording = true
    setStatus('listening')
    mediaRecorder.start(100)
  }

  function stopRecording() {
    if (!isRecording || !mediaRecorder) return
    isRecording = false
    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    setStatus('processing')
  }

  async function processAudio() {
    if (!sessionActive) return
    if (audioChunks.length === 0) {
      isProcessingTurn = false
      setStatus('idle')
      return
    }

    isProcessingTurn = true

    const audioBlob = new Blob(audioChunks)

    if (audioBlob.size < 1000) {
      isProcessingTurn = false
      setStatus('idle')
      return
    }

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY
      if (!apiKey) throw new Error('Groq API key not configured')

      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.mp4')
      formData.append('model', 'whisper-large-v3')

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error?.message || 'Whisper error')
      }

      const data = await response.json()
      const transcript = data.text?.trim() || ''
      usageStore.trackWhisper()

      if (!transcript) {
        isProcessingTurn = false
        setStatus('idle')
        return
      }

      addMessage({ role: 'user', content: transcript })
      await sendToLLM(transcript)

    } catch (err) {
      console.error('STT error:', err)
      isProcessingTurn = false
      setError(err instanceof Error ? err.message : 'STT failed')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  async function sendToLLM(userText: string) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey) {
      setError('Add VITE_GROQ_API_KEY to your .env file')
      setStatus('error')
      isProcessingTurn = false
      return
    }

    try {
      const messages = conversation.map(m => ({ role: m.role, content: m.content }))

      const systemPrompt = `You are a friendly and concise English conversation tutor.

RULES:
- Keep responses SHORT — 1 to 3 sentences max. No long explanations.
- Conversational tone, like a real person.
- Ask ONE follow-up question at a time.
- At the END of your response, if you notice grammar/vocabulary errors, add a correction in Spanish: "Corrección: dijiste 'X' pero se dice 'Y'."
- If no errors, don't mention it.
- If user says goodbye, respond with a short farewell.`

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            { role: 'user', content: userText }
          ],
          temperature: 0.7,
          max_tokens: 250
        })
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error?.message || 'Groq error')
      }

      const data = await response.json()
      const assistantMessage = data.choices[0]?.message?.content ?? "I'm not sure how to respond."
      usageStore.trackLLM()

      addMessage({ role: 'assistant', content: assistantMessage })
      await playTTS(assistantMessage)

    } catch (err) {
      console.error('LLM error:', err)
      setError(err instanceof Error ? err.message : 'AI error')
      setStatus('error')
      isProcessingTurn = false
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  async function playTTS(text: string) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey) {
      isProcessingTurn = false
      setStatus('idle')
      return
    }

    try {
      setStatus('speaking')
      usageStore.trackTTS()
      const { audioUrl } = await generateTTS(text, apiKey, 'groq')

      if (isIOS) {
        pendingTTS = { text, audioUrl }
        isProcessingTurn = false
        setStatus('idle')
        return
      }

      currentAudio = new Audio(audioUrl)
      currentAudio.playbackRate = $speed

      currentAudio.onended = () => {
        revokeTTSUrl(audioUrl)
        currentAudio = null
        pendingTTS = null
        isProcessingTurn = false
        setStatus('idle')
      }

      currentAudio.onerror = () => {
        revokeTTSUrl(audioUrl)
        currentAudio = null
        pendingTTS = null
        isProcessingTurn = false
        setStatus('idle')
      }

      await currentAudio.play()

    } catch (err) {
      console.error('TTS error:', err)
      isProcessingTurn = false
      setStatus('idle')
    }
  }

  async function playPendingTTS() {
    if (!pendingTTS || isPlayingTTS) return
    isPlayingTTS = true
    setStatus('speaking')

    currentAudio = new Audio(pendingTTS.audioUrl)
    currentAudio.playbackRate = $speed

    currentAudio.onended = () => {
      revokeTTSUrl(pendingTTS.audioUrl)
      pendingTTS = null
      currentAudio = null
      isPlayingTTS = false
      isProcessingTurn = false
      setStatus('idle')
    }

    currentAudio.onerror = () => {
      revokeTTSUrl(pendingTTS.audioUrl)
      pendingTTS = null
      currentAudio = null
      isPlayingTTS = false
      isProcessingTurn = false
      setStatus('idle')
    }

    await currentAudio.play()
  }

  function cleanup() {
    sessionActive = false
    if (mediaRecorder) {
      mediaRecorder.onstop = null
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    }
    if (micStream) {
      micStream.getTracks().forEach(track => track.stop())
      micStream = null
    }
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.src = ''
      currentAudio = null
    }
    isRecording = false
    isProcessingTurn = false
    pendingTTS = null
  }

  function endConversation() {
    cleanup()
    appStore.endSession()
  }
</script>

<div class="flex flex-col h-dvh bg-[#1a1a2e]">
  <header class="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
    <button
      class="bg-white/10 text-red-400 px-4 py-2 rounded-lg text-sm"
      onclick={endConversation}
    >
      End
    </button>
    <span class="text-sm text-indigo-400 capitalize">{$status}</span>
    <div class="w-[60px]"></div>
  </header>

  <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4" bind:this={messagesContainer}>
    {#each conversation as msg, i}
      <div class="max-w-[85%] animate-[fadeIn_0.3s_ease] {msg.role === 'user' ? 'self-end' : 'self-start'}">
        <div class="p-4 rounded-2xl leading-relaxed {msg.role === 'user' ? 'bg-indigo-500 text-white rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}">
          {msg.content}
        </div>
      </div>
    {/each}
  </div>

  {#if $status === 'error' && $currentSession}
    <div class="bg-red-500 text-white px-4 py-3 text-center text-sm">
      {$error || 'Something went wrong'}
    </div>
  {/if}

  <!-- iOS TTS play button -->
  {#if isIOS && pendingTTS}
    <div class="px-4 py-3">
      <button
        class="w-full flex items-center justify-center gap-3 py-4 bg-indigo-500 text-white rounded-2xl active:scale-[0.98] transition-transform"
        onclick={playPendingTTS}
      >
        <span class="text-2xl">🔊</span>
        <span class="font-semibold">Play Response</span>
      </button>
    </div>
  {/if}

  <!-- Push-to-talk button -->
  <div class="p-8 pb-[max(2rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-4">
    <!-- Status text -->
    <p class="text-sm text-gray-400 h-6">
      {#if $status === 'listening'}
        Recording... tap to stop
      {:else if $status === 'processing'}
        Thinking...
      {:else if $status === 'speaking'}
        Speaking...
      {:else if $status === 'error'}
        Tap to try again
      {:else}
        Tap the mic to speak
      {/if}
    </p>

    <!-- Big mic button -->
    <button
      class="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-200
        {$status === 'listening' ? 'bg-red-500 scale-110 shadow-lg shadow-red-500/50' : 'bg-indigo-500 hover:bg-indigo-400 active:scale-95'}
        {($status === 'processing' || $status === 'speaking') ? 'opacity-50 pointer-events-none' : ''}"
      onclick={toggleRecording}
      disabled={$status === 'processing' || $status === 'speaking'}
    >
      <span class="text-4xl">{$status === 'listening' ? '⏹️' : '🎤'}</span>
    </button>

    <!-- Recording waveform indicator -->
    {#if $status === 'listening'}
      <div class="flex items-center gap-1 h-8">
        {#each Array(5) as _, i}
          <div
            class="w-1 bg-red-400 rounded-sm animate-[wave_0.6s_ease-in-out_infinite]"
            style="height: {8 + Math.random() * 24}px; animation-delay: {i * 0.1}s"
          ></div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  @keyframes wave {
    0%, 100% { height: 8px; }
    50% { height: 32px; }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
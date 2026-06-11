<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte'
  import { appStore } from '../stores/app'
  import { get } from 'svelte/store'
  import type { Message } from '../types'
  import { generateTTS, revokeTTSUrl } from '../services/tts'
  import { usageStore } from '../stores/usage'
  import { API_CONFIG } from '../config/api'

  const { currentSession, status, speed, setStatus, addMessage, setError, error } = appStore

  let conversation: Message[] = []
  let audioChunks: Blob[] = []
  let isProcessingTurn = false
  let currentAudio: HTMLAudioElement | null = null
  let messagesContainer: HTMLDivElement | null = null
  let pendingTTS: { text: string; audioUrl: string } | null = null
  let isPlayingTTS = false
  let isRecording = false
  let sessionActive = false
  let showDebug = false
  let logs: { time: string; level: 'info' | 'error' | 'warn'; msg: string }[] = []

  // Detect iOS to show TTS play button instead of auto-play
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream

  function log(level: 'info' | 'error' | 'warn', msg: string) {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false })
    logs = [...logs.slice(-99), { time, level, msg }]
    if (!isIOS) console.log(`[${level.toUpperCase()}] ${msg}`)
  }

  $: conversation = $currentSession?.messages ?? []

  // Auto-scroll to bottom when conversation updates
  afterUpdate(() => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  })

  onMount(() => {
    // iOS Safari needs fresh getUserMedia for each recording
    sessionActive = true
    setStatus('idle')
  })

  onDestroy(() => {
    cleanup()
  })

  async function initAudio(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    })
    log('info', 'Mic stream acquired')
    return stream
  }

  function createMediaRecorder(stream: MediaStream): MediaRecorder {
    let mimeType = 'audio/aac'
    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4'
    } else if (!MediaRecorder.isTypeSupported('audio/aac')) {
      mimeType = ''
    }

    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data)
    }
    mr.onstop = processAudio

    return mr
  }

  function toggleRecording() {
    if (isProcessingTurn || isPlayingTTS) return

    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  let mediaRecorder: MediaRecorder | null = null

  function stopRecording() {
    if (!isRecording || !mediaRecorder) return
    isRecording = false
    log('info', 'Recording stopped')
    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    setStatus('processing')
  }

  function startRecording() {
    if (!sessionActive || isRecording) return

    // Reset chunks from previous attempts
    audioChunks = []
    isRecording = true
    setStatus('listening')
    log('info', 'Recording started')

    // Get fresh mic stream each time to avoid iOS Safari bug
    initAudio().then(stream => {
      mediaRecorder = createMediaRecorder(stream)
      mediaRecorder.start(100) // Collect data every 100ms

      // Clean up stream when recording stops
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        processAudio()
      }
    }).catch(err => {
      log('error', `Mic access denied: ${err}`)
      isRecording = false
      setError('Microphone access denied.')
      setStatus('error')
    })
  }

  async function processAudio() {
    log('info', `processAudio: sessionActive=${sessionActive}, audioChunks=${audioChunks.length}`)
    if (!sessionActive) {
      log('warn', 'processAudio: sessionActive is false, returning')
      return
    }
    if (audioChunks.length === 0) {
      log('warn', 'processAudio: audioChunks is empty, returning')
      isProcessingTurn = false
      setStatus('idle')
      return
    }

    isProcessingTurn = true

    const audioBlob = new Blob(audioChunks)
    log('info', `Audio blob: ${audioBlob.size} bytes`)

    if (audioBlob.size < 1000) {
      log('warn', 'Audio too small, ignoring')
      isProcessingTurn = false
      setStatus('idle')
      return
    }

    try {
      const apiKey = import.meta.env.VITE_GROQ_API_KEY
      if (!apiKey) throw new Error('Groq API key not configured')

      log('info', 'Sending to Whisper...')
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.mp4')
      formData.append('model', API_CONFIG.whisperModel)

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
      log('info', `Whisper result: "${transcript}"`)

      if (!transcript) {
        log('warn', 'Empty transcript, returning to idle')
        isProcessingTurn = false
        setStatus('idle')
        return
      }

      addMessage({ role: 'user', content: transcript })
      log('info', 'Calling LLM...')
      await sendToLLM(transcript)

    } catch (err) {
      log('error', `STT error: ${err instanceof Error ? err.message : String(err)}`)
      isProcessingTurn = false
      setError(err instanceof Error ? err.message : 'STT failed')
      setStatus('error')
      setTimeout(() => setStatus('idle'), 2000)
    }
  }

  async function sendToLLM(userText: string) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY
    if (!apiKey) {
      log('error', 'Groq API key not configured')
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

      log('info', 'Sending to LLM...')
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: API_CONFIG.llmModel,
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
      log('info', `LLM response: "${assistantMessage.substring(0, 50)}..."`)

      addMessage({ role: 'assistant', content: assistantMessage })
      log('info', 'Generating TTS...')
      await playTTS(assistantMessage)

    } catch (err) {
      log('error', `LLM error: ${err instanceof Error ? err.message : String(err)}`)
      isProcessingTurn = false
      setError(err instanceof Error ? err.message : 'STT failed')
      setStatus('error')
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
      log('info', 'Generating TTS audio...')
      const { audioUrl } = await generateTTS(text)
      log('info', 'TTS audio ready')

      if (isIOS) {
        pendingTTS = { text, audioUrl }
        isProcessingTurn = false
        setStatus('idle')
        return
      }

      currentAudio = new Audio(audioUrl)
      currentAudio.playbackRate = $speed
      log('info', 'Playing audio...')

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
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rate_limit') || msg.includes('429')) {
        // Try to extract wait time from Groq error message
        const waitMatch = msg.match(/try again in (\d+m)?(\d+s)?/)
        const waitTime = waitMatch
          ? waitMatch[0].replace('try again in ', '')
          : 'quota exhausted'
        setError(`Groq TTS limit reached. Try again in ${waitTime}`)
      } else {
        setError('TTS failed. Check debug logs.')
      }
      setStatus('error')
      isProcessingTurn = false
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
      mediaRecorder = null
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
    {#if isIOS}
      <button
        class="bg-white/10 text-gray-400 px-4 py-2 rounded-lg text-sm"
        onclick={() => showDebug = !showDebug}
      >
        {showDebug ? 'Hide' : 'Debug'}
      </button>
    {:else}
      <div class="w-[60px]"></div>
    {/if}
  </header>

  <!-- Debug panel (iOS only) -->
  {#if isIOS && showDebug}
    <div class="bg-black/50 border-b border-white/10 p-2 max-h-40 overflow-y-auto">
      <div class="flex justify-between items-center mb-1">
        <span class="text-xs text-gray-500">Logs</span>
        <button class="text-xs text-gray-500" onclick={() => logs = []}>Clear</button>
      </div>
      <div class="space-y-0.5">
        {#each logs as l}
          <div class="text-xs font-mono">
            <span class="text-gray-500">{l.time}</span>
            <span class="mx-1 {l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-yellow-400' : 'text-gray-300'}">[{l.level}]</span>
            <span class="text-gray-300">{l.msg}</span>
          </div>
        {/each}
        {#if logs.length === 0}
          <div class="text-xs text-gray-600 italic">No logs yet</div>
        {/if}
      </div>
    </div>
  {/if}

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
<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte'
  import { appStore } from '../stores/app'
  import { get } from 'svelte/store'
  import type { Message } from '../types'
  import { generateTTS, revokeTTSUrl } from '../services/tts'

  const { currentSession, status, speed, setStatus, addMessage, setError, error } = appStore

  let conversation: Message[] = []
  let transcript = ''
  let isRecording = false
  let mediaRecorder: MediaRecorder | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let animationFrame: number | null = null
  let silenceTimeout: ReturnType<typeof setTimeout> | null = null
  let audioChunks: Blob[] = []
  let isProcessingTurn = false
  let micStream: MediaStream | null = null
  let currentAudio: HTMLAudioElement | null = null
  let messagesContainer: HTMLDivElement | null = null
  let pendingTTS: { text: string; audioUrl: string } | null = null
  let isPlayingTTS = false
  let sessionActive = false

  // Detect iOS to show TTS play button instead of auto-play
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream

  const SILENCE_THRESHOLD = 1500
  const MAX_RECORDING_TIME = 20000

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
      // Request microphone with echo cancellation and noise suppression
      // to prevent Siri/system sounds from being captured
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100
        }
      })
      console.log('Mic stream tracks:', micStream.getTracks().map(t => t.label))
      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(micStream)
      source.connect(analyser)
      analyser.fftSize = 256

      // Use AAC format on iOS which is better supported
      // iOS Safari supports audio/aac and audio/mp4
      let mimeType = 'audio/aac'
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4'
      } else if (!MediaRecorder.isTypeSupported('audio/aac')) {
        mimeType = '' // let browser decide
      }

      mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined)
      console.log('MediaRecorder mimeType:', mediaRecorder.mimeType || 'browser default')

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }
      mediaRecorder.onstop = processAudio

      sessionActive = true
      startListening()
    } catch (err) {
      setError('Microphone access denied. Please enable it in your browser settings.')
      setStatus('error')
    }
  }

  function startListening() {
    if (!mediaRecorder || isProcessingTurn || isRecording || !sessionActive) return
    clearWatchdog()
    audioChunks = []
    isRecording = true
    setStatus('listening')
    mediaRecorder.start(100)

    setTimeout(() => {
      if (isRecording) stopListening()
    }, MAX_RECORDING_TIME)

    monitorSilence()
  }

  function stopListening() {
    if (!isRecording || !mediaRecorder) return
    isRecording = false
    if (silenceTimeout) clearTimeout(silenceTimeout)
    if (animationFrame) cancelAnimationFrame(animationFrame)
    if (mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    setStatus('processing')
  }

  let lastSoundTime = Date.now()
  let silenceHistory: number[] = []

  function monitorSilence() {
    if (!analyser || !isRecording) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

    // Keep rolling history of last 5 readings
    silenceHistory.push(average)
    if (silenceHistory.length > 5) silenceHistory.shift()

    const recentAverage = silenceHistory.reduce((a, b) => a + b, 0) / silenceHistory.length

    if (recentAverage > 15) {
      lastSoundTime = Date.now()
      silenceHistory = []
    } else if (Date.now() - lastSoundTime > SILENCE_THRESHOLD && isRecording) {
      stopListening()
      return
    }

    animationFrame = requestAnimationFrame(monitorSilence)
  }

  // Watchdog: if stuck in processing for >15s, reset to listening
  let watchdogTimeout: ReturnType<typeof setTimeout> | null = null

  function resetWatchdog() {
    if (watchdogTimeout) clearTimeout(watchdogTimeout)
    watchdogTimeout = setTimeout(() => {
      if ($status === 'processing' && isProcessingTurn) {
        console.warn('Watchdog: stuck in processing, resetting...')
        isProcessingTurn = false
        startListening()
      }
    }, 15000)
  }

  function clearWatchdog() {
    if (watchdogTimeout) {
      clearTimeout(watchdogTimeout)
      watchdogTimeout = null
    }
  }

  async function processAudio() {
    if (isProcessingTurn) return
    resetWatchdog()
    if (audioChunks.length === 0) {
      isProcessingTurn = false
      startListening()
      return
    }

    isProcessingTurn = true

    const audioBlob = new Blob(audioChunks)
    console.log('Audio blob:', audioBlob.size, 'bytes, type:', audioBlob.type || 'unknown')

    if (audioBlob.size < 1000) {
      console.warn('Audio blob too small, likely empty')
      isProcessingTurn = false
      startListening()
      return
    }

    try {
      // Use Groq's Whisper API for STT - more reliable on iOS
      const apiKey = import.meta.env.VITE_GROQ_API_KEY
      if (!apiKey) {
        throw new Error('Groq API key not configured')
      }

      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.webm')
      formData.append('model', 'whisper-large-v3')

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Whisper API error')
      }

      const data = await response.json()
      transcript = data.text?.trim() || ''
      console.log('Transcript:', transcript)

      if (!transcript) {
        isProcessingTurn = false
        startListening()
        return
      }

      addMessage({ role: 'user', content: transcript })
      await sendToLLM(transcript)

    } catch (err) {
      console.error('STT error:', err)
      clearWatchdog()
      isProcessingTurn = false
      setError(err instanceof Error ? err.message : 'STT failed')
      setTimeout(() => {
        const currentStatus = get(status)
        if (currentStatus !== 'idle') {
          addMessage({ role: 'assistant', content: "I didn't catch that. Could you repeat?" })
          startListening()
        }
      }, 1500)
    }
  }

  async function sendToLLM(userText: string) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY

    if (!apiKey) {
      setError('Groq API key not configured. Add VITE_GROQ_API_KEY to your .env file.')
      setStatus('error')
      isProcessingTurn = false
      return
    }

    try {
      const messages = conversation.map(m => ({
        role: m.role,
        content: m.content
      }))

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
        const error = await response.json()
        throw new Error(error.error?.message || 'Groq API error')
      }

      const data = await response.json()
      const assistantMessage = data.choices[0]?.message?.content ?? "I'm not sure how to respond to that."

      addMessage({ role: 'assistant', content: assistantMessage })

      const correctionMatch = assistantMessage.match(/Corrección:.*?(?=\n\n|$)/is)
      if (correctionMatch) {
        console.log('Correction detected:', correctionMatch[0])
      }

      await playTTS(assistantMessage)

    } catch (err) {
      console.error('LLM error:', err)
      clearWatchdog()
      setError(err instanceof Error ? err.message : 'Failed to get response from AI')
      setStatus('error')
      isProcessingTurn = false
    }
  }

  async function playTTS(text: string) {
    // Use Groq API key for TTS (same provider as LLM/STT)
    const apiKey = import.meta.env.VITE_GROQ_API_KEY

    if (!apiKey) {
      console.warn('Groq API key not configured for TTS')
      isProcessingTurn = false
      return
    }

    try {
      setStatus('speaking')

      const { audioUrl } = await generateTTS(text, apiKey, 'groq')

      if (isIOS) {
        pendingTTS = { text, audioUrl }
        isProcessingTurn = false
        startListening()
        return
      }

      currentAudio = new Audio(audioUrl)
      currentAudio.playbackRate = $speed
      console.log('Audio element created, attempting to play...')

      currentAudio.oncanplay = () => {
        console.log('Audio can play, starting...')
      }

      currentAudio.onended = () => {
        revokeTTSUrl(audioUrl)
        currentAudio = null
        isProcessingTurn = false
        clearWatchdog()
        startListening()
      }

      currentAudio.onerror = (e) => {
        console.error('Audio playback error:', e)
        revokeTTSUrl(audioUrl)
        currentAudio = null
        isProcessingTurn = false
        clearWatchdog()
        startListening()
      }

      await currentAudio.play()

    } catch (err) {
      console.error('TTS error:', err)
      clearWatchdog()
      isProcessingTurn = false
      startListening()
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
      clearWatchdog()
      startListening()
    }

    currentAudio.onerror = () => {
      revokeTTSUrl(pendingTTS.audioUrl)
      pendingTTS = null
      currentAudio = null
      isPlayingTTS = false
      isProcessingTurn = false
      clearWatchdog()
      startListening()
    }

    await currentAudio.play()
  }

  function cleanup() {
    sessionActive = false
    clearWatchdog()
    if (mediaRecorder) {
      mediaRecorder.onstop = null // prevent processAudio after cleanup
      if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
    }
    if (audioContext) audioContext.close()
    if (animationFrame) cancelAnimationFrame(animationFrame)
    if (silenceTimeout) clearTimeout(silenceTimeout)
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
  }

  function endConversation() {
    cleanup()
    appStore.endSession()
  }

  function getStatusText(s: string) {
    switch (s) {
      case 'listening': return 'Listening...'
      case 'processing': return 'Thinking...'
      case 'speaking': return 'Speaking...'
      case 'error': return 'Error'
      default: return ''
    }
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
    <span class="text-sm text-indigo-400 {$status !== 'idle' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300">
      {getStatusText($status)}
    </span>
    <div class="w-[60px]"></div>
  </header>

  <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-4" bind:this={messagesContainer}>
    {#each conversation as msg, i}
      <div class="max-w-[85%] animate-[fadeIn_0.3s_ease] {msg.role === 'user' ? 'self-end' : 'self-start'}">
        <div class="p-4 rounded-2xl leading-relaxed {msg.role === 'user' ? 'bg-indigo-500 text-white rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}">
          {msg.content}
        </div>
        {#if msg.role === 'user' && i > 0}
          <p class="text-xs text-gray-500 italic mt-1 px-2">"{msg.content}"</p>
        {/if}
      </div>
    {/each}
  </div>

  {#if $status === 'error' && $currentSession}
    <div class="bg-red-500 text-white px-4 py-3 text-center text-sm">
      Error: {$error || 'Something went wrong'}
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

  <div class="p-8 pb-[max(2rem,env(safe-area-inset-bottom))] flex justify-center">
    <div class="flex items-center gap-1 h-10">
      {#each Array(5) as _, i}
        <div
          class="w-1 h-2 bg-indigo-500 rounded-sm {$status === 'listening' ? 'animate-[wave_0.6s_ease-in-out_infinite]' : ''}"
          style="animation-delay: {i * 0.1}s"
        ></div>
      {/each}
    </div>
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
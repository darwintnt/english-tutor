<script lang="ts">
  import { onMount, onDestroy, afterUpdate } from 'svelte'
  import { appStore } from '../stores/app'
  import type { Message } from '../types'
  import { generateTTS, revokeTTSUrl } from '../services/tts'
  import { usageStore } from '../stores/usage'
  import { API_CONFIG } from '../config/api'

  const { currentSession, status, speed, setStatus, addMessage, setError, error, addCorrection } =
    appStore

  let conversation: Message[] = []
  let audioChunks: Blob[] = []
  let isProcessingTurn = false
  let currentAudio: HTMLAudioElement | null = null
  let messagesContainer: HTMLDivElement | null = null
  let pendingTTS: { text: string; audioUrl: string } | null = null
  let isPlayingTTS = false
  let isPaused = false
  let playingMessageId: number | null = null
  let isRecording = false
  let sessionActive = false
  let showDebug = false
  let logs: { time: string; level: 'info' | 'error' | 'warn'; msg: string }[] = []

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream

  function log(level: 'info' | 'error' | 'warn', msg: string) {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false })
    logs = [...logs.slice(-99), { time, level, msg }]
    if (!isIOS) console.log(`[${level.toUpperCase()}] ${msg}`)
  }

  $: conversation = $currentSession?.messages ?? []

  afterUpdate(() => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight
    }
  })

  onMount(() => {
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
        channelCount: 1,
      },
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

    audioChunks = []
    isRecording = true
    setStatus('listening')
    log('info', 'Recording started')

    initAudio()
      .then((stream) => {
        mediaRecorder = createMediaRecorder(stream)
        mediaRecorder.start(100)

        mediaRecorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop())
          processAudio()
        }
      })
      .catch((err) => {
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
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
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
      const messages = conversation.map((m) => ({ role: m.role, content: m.content }))

      const systemPrompt = `You are a friendly, concise, and encouraging English conversation tutor.

RULES:
1. Keep conversational responses SHORT — 1 to 3 sentences max. No long explanations.
2. Match the user's English level (use simple words for beginners).
3. Ask exactly ONE follow-up question at the end of your English text to keep the conversation going.
4. If the user speaks to you in Spanish, reply in English and gently encourage them to try in English.
5. STRICT CORRECTIONS, SUGGESTIONS & NONSENSE: Evaluate the input strictly for grammar errors and words that seem out of context (often caused by poor pronunciation). Add a brief spoken note in Spanish at the very end of your response ONLY for these cases (No symbols, emojis, or separators):
   - For grammar errors or wrong words, say: "Corrección: dijiste 'X' pero por el contexto lo correcto es 'Y'."
   - For awkward phrasing (correct but unnatural), say: "Sugerencia: te entendí bien, pero suena más natural decir 'Y'."
   - For nonsense/gibberish, say: "Nota: No entendí bien lo que dijiste, ¿podrías repetirlo?"
6. If the message is completely correct, natural, and makes sense, do NOT add any Spanish text at the end.
7. If the user says goodbye, respond with a short farewell and end the conversation.`

      log('info', 'Sending to LLM...')
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: API_CONFIG.llmModel,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            { role: 'user', content: userText },
          ],
          temperature: 0.7,
          max_tokens: 250,
        }),
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
      parseCorrections(assistantMessage)
      playingMessageId = conversation.length - 1
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
        playingMessageId = null
        isPaused = false
        isProcessingTurn = false
        setStatus('idle')
      }

      currentAudio.onerror = () => {
        revokeTTSUrl(audioUrl)
        currentAudio = null
        pendingTTS = null
        playingMessageId = null
        isPaused = false
        isProcessingTurn = false
        setStatus('idle')
      }

      await currentAudio.play()
    } catch (err) {
      console.error('TTS error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rate_limit') || msg.includes('429')) {
        const waitMatch = msg.match(/try again in (\d+m)?(\d+s)?/)
        const waitTime = waitMatch ? waitMatch[0].replace('try again in ', '') : 'quota exhausted'
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
      playingMessageId = null
      isPaused = false
      isProcessingTurn = false
      setStatus('idle')
    }

    currentAudio.onerror = () => {
      revokeTTSUrl(pendingTTS.audioUrl)
      pendingTTS = null
      currentAudio = null
      isPlayingTTS = false
      playingMessageId = null
      isPaused = false
      isProcessingTurn = false
      setStatus('idle')
    }

    await currentAudio.play()
  }

  async function playMessageAudio(msg: Message) {
    if (isPlayingTTS && playingMessageId === msg.id) {
      currentAudio?.pause()
      isPaused = true
      setStatus('idle')
      return
    }
    if (currentAudio && playingMessageId !== msg.id) {
      currentAudio.pause()
      currentAudio = null
    }
    setStatus('speaking')
    isPlayingTTS = true
    isPaused = false
    playingMessageId = msg.id

    const { audioUrl } = await generateTTS(msg.content)
    currentAudio = new Audio(audioUrl)
    currentAudio.playbackRate = $speed

    currentAudio.onended = () => {
      revokeTTSUrl(audioUrl)
      currentAudio = null
      playingMessageId = null
      isPlayingTTS = false
      isPaused = false
      setStatus('idle')
    }

    currentAudio.onerror = () => {
      revokeTTSUrl(audioUrl)
      currentAudio = null
      playingMessageId = null
      isPlayingTTS = false
      isPaused = false
      setStatus('idle')
    }

    await currentAudio.play()
  }

  function togglePlayPause(msg: Message) {
    if (isPaused && playingMessageId === msg.id) {
      currentAudio?.play()
      isPaused = false
      setStatus('speaking')
    } else if (isPlayingTTS && playingMessageId === msg.id) {
      currentAudio?.pause()
      isPaused = true
      setStatus('idle')
    } else if (currentAudio && playingMessageId !== msg.id) {
      currentAudio.pause()
      currentAudio = null
      pendingTTS = null
      isPaused = false
      playMessageAudio(msg)
    } else if (!currentAudio) {
      pendingTTS = null
      playMessageAudio(msg)
    }
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

  function parseCorrections(text: string) {
    // "Corrección: dijiste 'X' pero por el contexto lo correcto es 'Y'."
    const pattern =
      /Corrección:[\s\S]*?dijiste\s+['"]([^'"]+)['"][\s\S]*?lo\s+correcto\s+es\s+['"]([^'"]+)['"]/gi
    let match
    while ((match = pattern.exec(text)) !== null) {
      const original = match[1].trim()
      const corrected = match[2].trim()
      if (original && corrected) {
        addCorrection({
          original,
          corrected,
          explanation: `Corrección: "${original}" → "${corrected}"`,
        })
      }
    }
  }

  function getStatusText(s: typeof $status) {
    switch (s) {
      case 'listening':
        return 'Recording...'
      case 'processing':
        return 'Thinking...'
      case 'speaking':
        return 'Speaking...'
      case 'error':
        return 'Error'
      default:
        return 'Ready'
    }
  }
</script>

<div class="flex flex-col h-dvh bg-zinc-950 text-zinc-50">
  <!-- Header -->
  <header
    class="flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] border-b border-zinc-900"
  >
    <button
      class="h-9 px-4 inline-flex items-center justify-center rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
      onclick={endConversation}
    >
      End
    </button>

    <span class="text-sm font-medium text-zinc-500">{getStatusText($status)}</span>

    {#if isIOS}
      <button
        class="h-9 px-4 inline-flex items-center justify-center rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
        onclick={() => (showDebug = !showDebug)}
      >
        {showDebug ? 'Hide' : 'Debug'}
      </button>
    {:else}
      <div class="w-[60px]"></div>
    {/if}
  </header>

  <!-- Debug panel -->
  {#if isIOS && showDebug}
    <div class="bg-zinc-900 border-b border-zinc-800 p-3 max-h-36 overflow-y-auto">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs text-zinc-600 uppercase tracking-wider">Logs</span>
        <button class="text-xs text-zinc-500 hover:text-zinc-300" onclick={() => (logs = [])}
          >Clear</button
        >
      </div>
      <div class="space-y-0.5 font-mono text-xs">
        {#each logs as l}
          <div class="flex gap-2">
            <span class="text-zinc-600">{l.time}</span>
            <span
              class={l.level === 'error'
                ? 'text-red-500'
                : l.level === 'warn'
                  ? 'text-yellow-500'
                  : 'text-zinc-400'}>[{l.level}]</span
            >
            <span class="text-zinc-300">{l.msg}</span>
          </div>
        {/each}
        {#if logs.length === 0}
          <div class="text-xs text-zinc-700 italic">No logs yet</div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Messages -->
  <div class="flex-1 overflow-y-auto p-4 flex flex-col gap-3" bind:this={messagesContainer}>
    {#if conversation.length === 0}
      <div class="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div
          class="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="text-zinc-600"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        </div>
        <p class="text-zinc-500 text-sm">Tap the microphone to start speaking</p>
      </div>
    {/if}

    {#each conversation as msg, i}
      <div
        class="max-w-[80%] animate-in fade-in-0 slide-in-from-bottom-2 duration-200 {msg.role ===
        'user'
          ? 'self-end'
          : 'self-start'}"
      >
        <div
          class="px-4 py-3 rounded-2xl {msg.role === 'user'
            ? 'bg-zinc-800 text-zinc-100 rounded-br-md'
            : 'bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-bl-md'} relative group"
        >
          <p class="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
          {#if msg.role === 'assistant'}
            <button
              class="absolute -bottom-3 -right-3 w-8 h-8 rounded-full bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 flex items-center justify-center transition-opacity"
              onclick={() => togglePlayPause(msg)}
            >
              {#if isPlayingTTS && playingMessageId === msg.id && !isPaused}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                >
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              {/if}
            </button>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Error Banner -->
  {#if $status === 'error' && $currentSession}
    <div class="bg-red-500/10 border-t border-red-500/20 px-4 py-3">
      <p class="text-sm text-red-500 text-center">{$error || 'Something went wrong'}</p>
    </div>
  {/if}

  <!-- Mic Button -->
  <footer class="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] border-t border-zinc-900">
    <div class="flex flex-col items-center gap-3">
      <!-- Status text -->
      <p class="text-xs text-zinc-600">
        {#if $status === 'listening'}
          Recording... tap to stop
        {:else if $status === 'processing'}
          Processing...
        {:else if $status === 'speaking'}
          Playing...
        {:else}
          Tap to speak
        {/if}
      </p>

      <!-- Mic Button -->
      <button
        class="w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200
          {$status === 'listening'
          ? 'bg-red-500 hover:bg-red-600 scale-105'
          : 'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700'}
          {$status === 'processing' || $status === 'speaking'
          ? 'opacity-40 cursor-not-allowed'
          : 'active:scale-95'}"
        onclick={toggleRecording}
        disabled={$status === 'processing' || $status === 'speaking'}
      >
        {#if $status === 'listening'}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="6" y="6" width="12" height="12" rx="2" />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        {/if}
      </button>

      <!-- Recording indicator -->
      {#if $status === 'listening'}
        <div class="flex gap-1">
          {#each Array(3) as _}
            <div class="w-1 h-4 bg-red-500 rounded-full animate-pulse"></div>
          {/each}
        </div>
      {/if}
    </div>
  </footer>
</div>

<style>
  @keyframes fade-in-0 {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slide-in-from-bottom-2 {
    from {
      transform: translateY(8px);
    }
    to {
      transform: translateY(0);
    }
  }

  .animate-in {
    animation:
      fade-in-0 200ms ease-out,
      slide-in-from-bottom-2 200ms ease-out;
  }
</style>

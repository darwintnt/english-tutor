<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { appStore } from '../stores/app'
  import type { Message } from '../types'

  const { currentSession, status, speed, setStatus, addMessage, setError } = appStore

  let conversation: Message[] = []
  let transcript = ''
  let isRecording = false
  let mediaRecorder: MediaRecorder | null = null
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let animationFrame: number | null = null
  let silenceTimeout: ReturnType<typeof setTimeout> | null = null
  let audioChunks: Blob[] = []
  let audioElements: HTMLAudioElement[] = []

  const SILENCE_THRESHOLD = 2000 // ms
  const MAX_RECORDING_TIME = 30000 // 30s max

  $: conversation = $currentSession?.messages ?? []

  onMount(() => {
    initAudio()
  })

  onDestroy(() => {
    cleanup()
  })

  async function initAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContext = new AudioContext()
      analyser = audioContext.createAnalyser()
      const source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      analyser.fftSize = 256

      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }
      mediaRecorder.onstop = processAudio

      startListening()
    } catch (err) {
      setError('Microphone access denied. Please enable it in your browser settings.')
      setStatus('error')
    }
  }

  function startListening() {
    if (!mediaRecorder) return
    audioChunks = []
    isRecording = true
    setStatus('listening')
    mediaRecorder.start(100)

    // Auto-stop after max recording time
    setTimeout(() => {
      if (isRecording) stopListening()
    }, MAX_RECORDING_TIME)

    // Monitor for silence
    monitorSilence()
  }

  function stopListening() {
    if (!isRecording || !mediaRecorder) return
    isRecording = false
    if (silenceTimeout) clearTimeout(silenceTimeout)
    if (animationFrame) cancelAnimationFrame(animationFrame)
    mediaRecorder.stop()
    setStatus('processing')
  }

  let lastSoundTime = Date.now()

  function monitorSilence() {
    if (!analyser || !isRecording) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteFrequencyData(dataArray)
    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length

    if (average > 10) {
      lastSoundTime = Date.now()
    } else if (Date.now() - lastSoundTime > SILENCE_THRESHOLD && isRecording) {
      stopListening()
      return
    }

    animationFrame = requestAnimationFrame(monitorSilence)
  }

  async function processAudio() {
    if (audioChunks.length === 0) {
      startListening()
      return
    }

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })

    try {
      // Load Whisper model
      const { pipeline, env } = await import('@huggingface/transformers')
      env.allowLocalModels = false
      env.useBrowserCache = true

      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base', {
        device: 'webgpu',
      })

      // Decode WebM to PCM
      const arrayBuffer = await audioBlob.arrayBuffer()
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      const audioData = audioBuffer.getChannelData(0)
      audioCtx.close()

      // Transcribe
      const result = await transcriber(audioData, {
        task: 'transcribe',
        language: 'english'
      }) as { text: string }

      transcript = result.text.trim()

      if (!transcript) {
        startListening()
        return
      }

      addMessage({ role: 'user', content: transcript })
      await sendToLLM(transcript)

    } catch (err) {
      console.error('STT error:', err)
      addMessage({ role: 'assistant', content: "I didn't catch that. Could you repeat?" })
      startListening()
    }
  }

  async function sendToLLM(userText: string) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY

    if (!apiKey) {
      setError('Groq API key not configured. Add VITE_GROQ_API_KEY to your .env file.')
      setStatus('error')
      return
    }

    try {
      const messages = conversation.map(m => ({
        role: m.role,
        content: m.content
      }))

      // Add system prompt with correction instruction
      const systemPrompt = `You are a friendly English conversation tutor. Your task:
1. Have a natural conversation in English with the user
2. At the END of your response, if you notice any grammar, vocabulary, or pronunciation errors, include a correction in Spanish
3. Format corrections like this: "Corrección: dijiste 'X' pero se dice 'Y'. Explicación: ..."
4. If there are no obvious errors, don't mention it
5. Keep responses conversational, ask follow-up questions
6. If the user says goodbye or wants to end, say a nice goodbye`

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
          max_tokens: 500
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error?.message || 'Groq API error')
      }

      const data = await response.json()
      const assistantMessage = data.choices[0]?.message?.content ?? "I'm not sure how to respond to that."

      addMessage({ role: 'assistant', content: assistantMessage })

      // Check for correction and extract it
      const correctionMatch = assistantMessage.match(/Corrección:.*?(?=\n\n|$)/is)
      if (correctionMatch) {
        const correction = correctionMatch[0]
        // We could parse and store the correction here
        console.log('Correction detected:', correction)
      }

      // Convert to speech and play
      await playTTS(assistantMessage)

    } catch (err) {
      console.error('LLM error:', err)
      setError(err instanceof Error ? err.message : 'Failed to get response from AI')
      setStatus('error')
    }
  }

  async function playTTS(text: string) {
    const apiKey = import.meta.env.VITE_CARTESIA_API_KEY

    if (!apiKey) {
      console.warn('Cartesia API key not configured')
      return
    }

    try {
      setStatus('speaking')

      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Cartesia-Version': '2024-06-10'
        },
        body: JSON.stringify({
          model_id: 'sonic-3.5',
          transcript: text,
          voice: {
            mode: 'id',
            id: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4'
          },
          language: 'en',
          output_format: {
            container: 'mp3',
            bit_rate: 128000,
            sample_rate: 44100
          }
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Cartesia error:', response.status, errorText)
        throw new Error(`Cartesia API error: ${response.status}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' })
      const audioUrl = URL.createObjectURL(audioBlob)
      const audio = new Audio(audioUrl)
      audio.playbackRate = $speed

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        startListening()
      }

      audio.onerror = (e) => {
        console.error('Audio playback error:', e)
        URL.revokeObjectURL(audioUrl)
        startListening()
      }

      await audio.play()

    } catch (err) {
      console.error('TTS error:', err)
      // Fallback: just show text, no audio
      startListening()
    }
  }

  function cleanup() {
    if (mediaRecorder) mediaRecorder.stop()
    if (audioContext) audioContext.close()
    if (animationFrame) cancelAnimationFrame(animationFrame)
    if (silenceTimeout) clearTimeout(silenceTimeout)
    audioElements.forEach(a => a.pause())
    audioElements = []
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

<div class="conversation">
  <header>
    <button class="back-btn" onclick={endConversation}>End</button>
    <span class="status" class:visible={$status !== 'idle'}>{getStatusText($status)}</span>
    <div class="spacer"></div>
  </header>

  <div class="messages">
    {#each conversation as msg, i}
      <div class="message {msg.role}">
        <div class="bubble">{msg.content}</div>
        {#if msg.role === 'user' && i > 0}
          <div class="transcript">"{msg.content}"</div>
        {/if}
      </div>
    {/each}
  </div>

  {#if $status === 'error' && $currentSession}
    <div class="error-banner">
      Error: {conversation[conversation.length - 1]?.content}
    </div>
  {/if}

  <div class="controls">
    <div class="waveform" class:active={$status === 'listening'}>
      {#each Array(5) as _, i}
        <div class="bar" style="animation-delay: {i * 0.1}s"></div>
      {/each}
    </div>
  </div>
</div>

<style>
  .conversation {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: #1a1a2e;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    padding-top: max(1rem, env(safe-area-inset-top));
  }

  .back-btn {
    background: rgba(255,255,255,0.1);
    border: none;
    color: #ef4444;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .status {
    font-size: 0.85rem;
    color: #6366f1;
    opacity: 0;
    transition: opacity 0.3s;
  }

  .status.visible {
    opacity: 1;
  }

  .spacer {
    width: 60px;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    max-width: 85%;
    animation: fadeIn 0.3s ease;
  }

  .message.user {
    align-self: flex-end;
  }

  .message.assistant {
    align-self: flex-start;
  }

  .bubble {
    padding: 1rem;
    border-radius: 1rem;
    line-height: 1.5;
  }

  .user .bubble {
    background: #6366f1;
    color: white;
    border-bottom-right-radius: 0.25rem;
  }

  .assistant .bubble {
    background: rgba(255,255,255,0.1);
    color: #fff;
    border-bottom-left-radius: 0.25rem;
  }

  .transcript {
    font-size: 0.75rem;
    color: #666;
    font-style: italic;
    margin-top: 0.25rem;
    padding: 0 0.5rem;
  }

  .error-banner {
    background: #ef4444;
    color: white;
    padding: 0.75rem;
    text-align: center;
    font-size: 0.85rem;
  }

  .controls {
    padding: 2rem;
    padding-bottom: max(2rem, env(safe-area-inset-bottom));
    display: flex;
    justify-content: center;
  }

  .waveform {
    display: flex;
    gap: 4px;
    align-items: center;
    height: 40px;
  }

  .bar {
    width: 4px;
    height: 8px;
    background: #6366f1;
    border-radius: 2px;
  }

  .waveform.active .bar {
    animation: wave 0.6s ease-in-out infinite;
  }

  @keyframes wave {
    0%, 100% { height: 8px; }
    50% { height: 32px; }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
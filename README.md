# English Speaking Coach

A PWA that acts as your personal AI English conversation tutor. Speak freely, get corrections in Spanish, improve your spoken English.

## Features

- **Voice-first conversation** — Speak naturally, no typing required
- **Real-time corrections** — Grammar mistakes are caught and explained in Spanish at the end of each turn
- **Adjustable speed** — Listen at 0.75x, 1x, 1.25x, or 1.5x speed
- **Installable PWA** — Works on iPhone, Android, and desktop as a native app
- **Offline STT** — Speech-to-text runs locally (Whisper), no data sent to servers for transcription
- **Session history** — Tracks your conversations and corrections over time

## How it works

```
You speak → Whisper (browser) → LLaMA 3.3 (Groq) → Cartesia TTS → You hear the response
                              ↓
                    Correction in Spanish (if errors)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Svelte + Vite + TypeScript |
| STT | Whisper (transformers.js, runs in browser) |
| VAD | Silero VAD (voice activity detection) |
| LLM | LLaMA 3.3 70B via Groq API |
| TTS | Cartesia Sonic 3.5 |
| PWA | vite-plugin-pwa + Workbox |

## Setup

### 1. Clone and install

```bash
cd english-tutor
npm install
```

### 2. Configure API keys

Create a `.env` file (copy from `.env.example`):

```bash
cp .env.example .env
```

Edit `.env` and add your keys:

- **Groq**: https://console.groq.com/keys — free tier available
- **Cartesia**: https://cartesia.ai — free tier with 300k chars/month

```
VITE_GROQ_API_KEY=gsk_...
VITE_CARTESIA_API_KEY=...
```

### 3. Run

```bash
npm run dev
```

Open `http://localhost:5173` in your browser.

### 4. Install as PWA

- **Desktop**: Chrome/Edge → three dots menu → "Install English Coach"
- **iPhone**: Safari → Share button → "Add to Home Screen"
- **Android**: Chrome → three dots menu → "Install app"

## Project Structure

```
src/
├── App.svelte                    # Root component, screen routing
├── lib/
│   ├── types.ts                 # TypeScript types (Message, Session, etc.)
│   ├── stores/
│   │   └── app.ts               # Global state (screen, session, speed)
│   └── components/
│       ├── Home.svelte           # Start screen + speed selector
│       ├── Conversation.svelte   # Main conversation loop
│       └── EndSession.svelte     # Session summary
.env.example                      # API key template
vite.config.ts                    # Vite + PWA configuration
```

## Usage

1. Tap **Start Conversation**
2. Speak about any topic (e.g., "Tell me about your day")
3. The AI responds and asks follow-up questions
4. If you make a mistake, you'll get a correction in Spanish at the end of the turn
5. Adjust speech speed with the slider at the bottom
6. Say "goodbye" or tap **End** when done

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_GROQ_API_KEY` | Groq API key for LLaMA 3.3 |
| `VITE_CARTESIA_API_KEY` | Cartesia API key for TTS |

## Requirements

- Modern browser with WebGPU support (Chrome, Edge, Safari)
- Microphone permission
- Internet connection (for LLM and TTS — STT runs offline)
# English Speaking Coach

A PWA that acts as your personal AI English conversation tutor. Speak freely, get corrections in Spanish, improve your spoken English.

## Features

- **PIN protection** — App access secured with a PIN code (configurable via env var)
- **Push-to-talk** — Tap to record, tap to stop, full control over when you speak
- **Real-time corrections** — Grammar mistakes are caught and explained in Spanish at the end of each turn
- **Adjustable speed** — Listen at 0.75x, 1x, 1.25x, or 1.5x speed
- **Installable PWA** — Works on iPhone, Android, and desktop as a native app
- **Multiple TTS providers** — Choose between Groq, Cartesia, or Google Cloud TTS
- **Daily usage tracking** — See how many API calls you have left with color-coded bar
- **iOS debug panel** — Built-in logs viewer to troubleshoot on iPhone

## How it works

```
You speak → Groq Whisper (STT) → LLaMA 3.3 (Groq) → TTS (provider) → You hear the response
                              ↓
                    Correction in Spanish (if errors)
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Svelte + Vite + TypeScript + Tailwind CSS v4 |
| STT | Whisper Large v3 via Groq API |
| LLM | LLaMA 3.3 70B via Groq API |
| TTS | Groq Orpheus / Cartesia Sonic 3.5 / Google Cloud TTS |
| Auth | PIN code from env var with 1-hour session |
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

- **Groq** (required): https://console.groq.com/keys — free tier: 1K LLM req/day, 2K Whisper req/day, 100 TTS req/day
- **Google Cloud TTS** (optional): https://console.cloud.google.com/apis/credentials — free tier: 4M chars/month
- **Cartesia** (optional): https://cartesia.ai — free tier limited

```bash
# Required
VITE_GROQ_API_KEY=gsk_...

# Security - PIN to access the app (minimum 4 digits)
VITE_AUTH_PIN=1234

# TTS Provider selection: 'groq', 'cartesia', or 'google'
VITE_TTS_PROVIDER=groq

# Google Cloud TTS (if VITE_TTS_PROVIDER=google)
VITE_GOOGLE_TTS_API_KEY=...
VITE_GOOGLE_TTS_VOICE=en-US-Chirp-HD-F
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

## Security

The app is protected with a PIN code:

- PIN is set via `VITE_AUTH_PIN` environment variable
- PIN is hashed before storage — never stored in plain text
- Session expires after **1 hour** — re-authentication required
- Only devices with the configured PIN can access the app

## Project Structure

```
src/
├── App.svelte                    # Root component, screen routing + auth gate
├── lib/
│   ├── types.ts                 # TypeScript types (Message, Session, etc.)
│   ├── config/
│   │   ├── api.ts               # API configuration from env vars
│   │   └── tts.ts               # TTS provider abstraction
│   ├── services/
│   │   ├── tts.ts               # TTS generation (Groq, Cartesia, Google)
│   │   └── api-health.ts        # API health check
│   ├── stores/
│   │   ├── app.ts               # Global state (screen, session, speed)
│   │   ├── auth.ts              # PIN authentication with 1-hour session
│   │   └── usage.ts             # Daily API usage tracking
│   └── components/
│       ├── AuthScreen.svelte     # PIN entry screen
│       ├── Home.svelte           # Start screen + speed selector + usage bar
│       ├── Conversation.svelte   # Main conversation loop + debug panel
│       └── EndSession.svelte     # Session summary
.env.example                      # Environment variables template
vite.config.ts                    # Vite + PWA configuration
```

## Usage

1. Enter your **PIN** to access the app
2. Tap **Start Conversation**
3. Tap the **microphone button** to start recording
4. Speak about any topic
5. Tap the **stop button** to send
6. The AI responds and asks follow-up questions
7. If you make a mistake, you'll get a correction in Spanish at the end
8. Adjust speech speed with the slider at the bottom
9. Say "goodbye" or tap **End** when done

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_GROQ_API_KEY` | (required) | Groq API key |
| `VITE_AUTH_PIN` | (required) | PIN code to access the app (min 4 digits) |
| `VITE_LLM_MODEL` | `llama-3.3-70b-versatile` | Groq LLM model |
| `VITE_WHISPER_MODEL` | `whisper-large-v3` | Whisper STT model |
| `VITE_TTS_PROVIDER` | `groq` | TTS provider: `groq`, `cartesia`, or `google` |
| `VITE_GROQ_TTS_VOICE` | `austin` | Groq TTS voice: `austin`, `troy`, `hannah` |
| `VITE_GROQ_TTS_MODEL` | `canopylabs/orpheus-v1-english` | Groq TTS model |
| `VITE_CARTESIA_TTS_VOICE` | `db6b0ed5-...` | Cartesia voice ID |
| `VITE_GOOGLE_TTS_API_KEY` | (optional) | Google Cloud TTS API key |
| `VITE_GOOGLE_TTS_VOICE` | `en-US-Neural2-D` | Google TTS voice name |

## TTS Provider Comparison

| Provider | Free Tier | Quality | Notes |
|----------|-----------|---------|-------|
| **Groq** | 100 req/day | Good | Fast, simple setup |
| **Google Cloud** | 4M chars/month | Excellent | Neural voices, high volume |
| **Cartesia** | Limited | Very Good | Good voices, limited free tier |

## Requirements

- Modern browser with WebAudio support (Chrome, Edge, Safari)
- Microphone permission
- Internet connection (for STT, LLM, and TTS)
- PIN code to access the app (configured in `.env`)
# OfficeMates / CampusSuite

**Multi-Agent Student Productivity Platform with Voice-First AI**

CruzHacks 3.0 Project - Pixelated office of AI agents that process student inputs (slides, audio, PDFs, voice) and create polished notes saved to Opennote.

---

## Quick Start

### 1. Install Dependencies

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### 2. Configure Environment

Copy `.env` and fill in your API keys:

```bash
cp .env.example .env
```

### 3. Run the Application

```bash
# Terminal 1: Backend
cd backend
python main.py
# or: uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

---

## API Keys Required

| Service | Environment Variable | Get Key |
|---------|---------------------|---------|
| Google AI (Gemini) | `GOOGLE_API_KEY` | [Google AI Studio](https://makersuite.google.com/app/apikey) |
| LiveKit | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | [LiveKit Cloud](https://cloud.livekit.io/) |
| Deepgram | `DEEPGRAM_API_KEY` | [Deepgram Console](https://console.deepgram.com/) |
| Opennote | `OPENNOTE_API_KEY` | [Opennote Docs](https://opennote-4c3f15e9.mintlify.app/) |
| Unwrap.ai | `UNWRAP_API_KEY` | [Unwrap.ai](https://unwrap.ai/) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React + PixiJS)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Pixel Map   │  │ Voice UI    │  │ Gradebook   │  │ Agent View  │    │
│  │ (PixiJS)    │  │ (LiveKit)   │  │ (XP/Badges) │  │ (Progress)  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ WebSocket / REST
┌─────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (FastAPI)                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MULTI-AGENT ORCHESTRATOR                      │   │
│  │  ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐  │   │
│  │  │ Intake │→│ Processor│→│ Editor │→│Researcher│→│ Actioner │  │   │
│  │  └────────┘ └──────────┘ └────────┘ └──────────┘ └──────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│  ┌───────────────┬───────────────┬───────────────┬───────────────┐    │
│  │ LiveKit       │ Deepgram      │ Opennote      │ Unwrap.ai     │    │
│  │ (Voice)       │ (STT)         │ (Notes/AI)    │ (Social)      │    │
│  └───────────────┴───────────────┴───────────────┴───────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Agent Pipeline

| Agent | Role | Opennote | Unwrap |
|-------|------|----------|--------|
| **Intake** | Parse metadata, extract due dates | - | - |
| **Processor** | Heavy LLM work (summaries, OCR, STT) | Feynman-3 model | - |
| **Editor** | Clean, normalize, polish content | Feynman-3 model | - |
| **Researcher** | Enrich with community context | - | Search API |
| **Actioner** | Create gradebook entries, save notes | Create Note API | - |
| **QA** | Validate, confidence scoring | - | - |
| **Personality** | UI messages, voice responses | - | - |

---

## Voice Interaction Flow

```
User speaks → LiveKit captures audio
                    ↓
            Deepgram STT transcribes
                    ↓
            Intent Detection
            ┌───────┴───────┐
      Question?         Dictation?
           ↓                 ↓
      Search Notes     Run Agent Pipeline
           ↓                 ↓
      Voice Response   Create Note → Opennote
                             ↓
                       Voice Confirmation
```

---

## API Endpoints

### Tasks
- `POST /api/tasks` - Create processing task
- `GET /api/tasks/{id}` - Get task status
- `GET /api/tasks?user_id=xxx` - List user tasks

### Voice
- `POST /api/voice/session` - Create voice session (returns LiveKit token)
- `POST /api/voice/transcript` - Process transcript
- `GET /api/livekit/token` - Get LiveKit token directly

### Users
- `GET /api/users/{id}/xp` - Get XP and level
- `POST /api/users/{id}/xp` - Update XP

### Departments
- `GET /api/departments` - List all departments

### WebSocket
- `WS /ws/{user_id}` - Real-time updates

---

## WebSocket Events

### Client → Server
```json
{ "event": "transcript", "text": "...", "is_final": true }
{ "event": "ping" }
```

### Server → Client
```json
{ "event": "task_progress", "current_agent": "Processor", "progress": 0.5 }
{ "event": "task_completed", "xp_awarded": 15, "opennote_note_id": "..." }
{ "event": "voice_response", "text": "...", "agent": "Professor Pixel" }
{ "event": "xp_update", "level": 3, "level_up": true }
```

---

## Department Personalities

| Department | Agent | Catchphrase | Color |
|------------|-------|-------------|-------|
| Math | Professor Pixel | "Let me calculate..." | #4A90D9 |
| Science | Dr. Beaker | "Hypothesis confirmed!" | #5CB85C |
| English | Scribe McWrite | "A tale worth telling..." | #F0AD4E |
| Study Hub | Coach Campus | "You've got this!" | #9B59B6 |

---

## Gamification

### XP Rewards
- Note created: 10 XP
- Voice note: 15 XP
- Flashcard correct: 5 XP
- Quiz completed: 15 XP
- Streak day: 20 XP

### Levels
1. Freshman (0 XP)
2. Sophomore (100 XP) - Custom avatar color
3. Junior (300 XP) - Desk plant
4. Senior (600 XP) - Custom agent name
5. Graduate (1000 XP) - Gold badge
10. Professor (5000 XP) - All decorations

---

## Demo Script (3 min)

```
0:00 - Hook: "This is CampusSuite: your pixel office where agents do the heavy lifting."

0:10 - Drag lecture slides to Math Intake → show agent procession

0:30 - Processor shows summary; Researcher pulls community tips from Unwrap

0:50 - Actioner saves note to Opennote (show success)

1:10 - Open Gradebook, mark item done → XP + decor unlock

1:25 - Voice demo: "Hey, can you explain integrals?" → Agent responds

1:45 - Show Manim video generation for equation

2:00 - Quick flashcard quiz from note

2:20 - Wrap: API log screenshot proving Opennote & Unwrap integration
```

---

## Project Structure

```
CruzHacks3.0/
├── .env                          # Environment variables
├── MASTER_CONFIG.py              # All prompts, schemas, configs
├── README.md
│
├── backend/
│   ├── main.py                   # FastAPI server
│   ├── requirements.txt
│   └── manim_scenes/            # Manim video templates
│
└── frontend/
    ├── package.json
    └── src/
        ├── lib/
        │   └── livekit-voice.ts  # LiveKit integration
        ├── hooks/
        │   └── useVoiceSession.ts
        └── components/
            └── VoiceInterface.tsx
```

---

## Troubleshooting

### LiveKit connection fails
- Check `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`
- Ensure LiveKit URL starts with `wss://`

### Deepgram not transcribing
- Verify `DEEPGRAM_API_KEY` is valid
- Check browser microphone permissions
- Ensure sample rate matches (16000 Hz)

### Demo mode
Set `ENABLE_MOCKS=true` in `.env` for stable demo with mock responses.

---

## Team

CruzHacks 3.0 - Built with LiveKit, Deepgram, Opennote, Unwrap.ai, Manim, and love.

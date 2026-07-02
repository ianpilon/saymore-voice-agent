# Saymore — Talk it out. Get the gold.

A voice agent that interviews you like a great podcast host — warm, curious, one question at a time — then mines the transcript for the raw, post-worthy **nuggets** worth turning into a LinkedIn post. Built on [Vapi](https://vapi.ai). **Helping you share your voice.**

![Saymore](docs/screenshot.png)

## The idea

Your best ideas come out when you talk, not when you stare at a blank page. Saymore is a two-stage pipeline:

1. **The interview (live, voice).** A conversational agent opens a few doors ("something you figured out, someone who impressed you, an opinion you're chewing on"), then follows its curiosity — reacting before it asks, chasing specifics, pulling for real numbers and turning points. The sacred rule: the interviewer has *no idea* it's mining for content. It never steers you toward sounding polished. It just gets true, vivid material out of you.
2. **The nugget report (after the call).** The moment you hang up, a second agent reads the whole transcript and extracts ranked **nuggets** — each tagged Learning / Shout-out / Hot take / Story, with a hook, why it works, **verbatim quotes**, and the specifics to build with. Extract, never invent. You download it as Markdown.

The two stages are deliberately decoupled: the conversation stays authentic because the host isn't performing for an output; the editor does all the judgment afterward.

## Features

- **Live voice interview** in the browser (Vapi Web SDK) — no phone, no app to install
- **Automatic nugget extraction** the instant a call ends
- **Four nugget categories**: Learning, Shout-out, Hot take, Story
- **Verbatim quotes** pulled exactly as you said them — the raw material a writer builds from
- **Downloadable report** (`.md`) and transcript (`.txt`)
- **Transient assistant pattern** — the interviewer config is built per call via webhook
- **Web-only & stateless** — each session is self-contained: talk → nuggets → download

## Architecture

```
docs/index.html            ← landing page + in-browser voice UI + nuggets results
server.js                  ← Express server: assistant config + nugget extraction
interviewer-prompt.txt     ← THE HOST: identity, tone, how to interview (live)
nugget-extractor-prompt.txt ← THE EDITOR: how to mine a transcript into nuggets (after)
```

Two endpoints:

- `POST /webhook/assistant-request` — returns the interviewer config (system prompt lives server-side, read from `interviewer-prompt.txt`)
- `POST /extract-nuggets` — takes `{ transcript: [{role, text}] }`, runs the editor prompt via the OpenAI API, returns `{ read, nuggets: [...] }`

## Prerequisites

- Node.js **v18+**
- A [Vapi](https://vapi.ai) account (public key)
- An [OpenAI](https://platform.openai.com) API key (used server-side for nugget extraction)

## Installation

```bash
git clone https://github.com/ianpilon/saymore-voice-agent.git
cd saymore-voice-agent
npm install
cp .env.example .env      # then add your OPENAI_API_KEY
```

## Configuration

### 1. The server (`.env`)

```bash
PORT=3000
OPENAI_API_KEY=sk-...     # required — runs the nugget extractor, server-side only
```

### 2. The landing page (`docs/index.html`)

Update the `CONFIG` block near the bottom of the `<script type="module">`:

```js
const VAPI_PUBLIC_KEY     = "your-vapi-public-key";
const ASSISTANT_API       = "https://your-deployed-backend.example.com/webhook/assistant-request?web=1";
const EXTRACT_NUGGETS_API = "https://your-deployed-backend.example.com/extract-nuggets";
```

### 3. Tune the behavior

- **The interview:** edit `interviewer-prompt.txt`
- **The nuggets:** edit `nugget-extractor-prompt.txt`
- **The voice / model:** in `server.js` (`voice.voiceId`, `INTERVIEWER_MODEL`, `EXTRACTOR_MODEL`)

## Running

```bash
npm start          # server on http://localhost:3000
```

### Smoke test (no browser needed)

```bash
node test-webhook.js     # hits both endpoints with sample data
```

### Expose + host the page

The backend must be public (the browser calls it). Use ngrok for local dev:

```bash
ngrok http 3000
```

Host `docs/index.html` anywhere static (GitHub Pages, Netlify, Vercel…) — just point the `CONFIG` URLs at your backend.

## Deployment

`Dockerfile` and `render.yaml` are included for one-click deploys (Render, Fly, Railway, any container host). Set `OPENAI_API_KEY` as an environment variable on your host.

## File Structure

```
├── server.js                   # Webhook server + nugget extraction
├── interviewer-prompt.txt      # Live interviewer system prompt (the host)
├── nugget-extractor-prompt.txt # Post-call editor system prompt (the editor)
├── docs/index.html             # Landing page + voice UI + nuggets report
├── test-webhook.js             # Smoke test for both endpoints
├── package.json
├── Dockerfile
├── render.yaml
└── README.md
```

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/webhook/assistant-request` | Returns the interviewer assistant config |
| `POST` | `/extract-nuggets` | Mines a transcript into nuggets |
| `GET`  | `/healthz` | Health check |

## Notes & next steps

- **No persistence (by design).** Each session is self-contained — perfect for v1. To add a "library" of past nuggets later, key storage to an identity (email or phone) and reuse Untangle-style memory injection.
- **Phone support** is intentionally absent for now. It slots cleanly into the existing webhook pattern later (store nuggets keyed to the caller's number, text them a link).
- The system prompt is delivered to the browser as part of the assistant config (inherent to Vapi's transient-assistant pattern). For a hardened deployment, move to a server-side assistant.

## License

MIT

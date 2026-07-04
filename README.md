# Saymore — Talk it out. Get the gold.

A voice agent that interviews you like a great podcast host — warm, curious, one question at a time — then hands back **finished LinkedIn posts** written in your own voice, built around the real work you actually did. Built on [Vapi](https://vapi.ai). **Helping you share your voice.**

![Saymore](docs/screenshot.png)

**Live:** https://saymore.voiceclaw.ca

## The idea

Your best ideas come out when you talk, not when you stare at a blank page. Saymore is a two-stage pipeline:

1. **The interview (live, voice).** A conversational agent opens a few doors ("something you figured out, someone who impressed you, an opinion you're chewing on"), then follows its curiosity — reacting before it asks, chasing specifics, pulling for real numbers and turning points. The sacred rule: the interviewer has *no idea* it's writing posts. It never steers you toward sounding polished. It just gets true, vivid material out of you.
2. **The posts (after the call).** The moment you hang up, a ghostwriter agent reads the whole transcript, mines it for **stories** (decisions, mistakes, turning points with stakes), clusters them, and writes a **finished, publish-ready LinkedIn post** for each — in your own voice, stripped of AI-speak, 120–220 words, first person. Nothing is invented; anything missing is flagged. You copy and publish.

The two stages are deliberately decoupled: the conversation stays authentic because the host isn't performing for an output; the ghostwriter does all the shaping afterward.

## The two LLMs

| Stage | Model | Where it runs | Key |
|---|---|---|---|
| **Live interview** | Gemini 2.0 Flash | Inside Vapi (native provider) | just your Vapi account |
| **Post writing** | GLM 5.2 | On your server, via its OpenAI-compatible endpoint | your GLM/Zhipu key |

Vapi has no native GLM/Zhipu provider, so the live call uses Vapi-native **Gemini** (zero extra setup, works with just a Vapi account). The post-call ghostwriting runs on **GLM** via Zhipu's OpenAI-compatible endpoint. No OpenAI anywhere.

## Features

- **Live voice interview** in the browser (Vapi Web SDK) — no phone, no app to install
- **Zero-CDN**: the Vapi SDK is bundled locally (`docs/vapi.js`) so it works on networks that block `esm.sh`
- **Auto-configured**: the server serves the page and injects config — no hand-editing URLs or keys into the HTML
- **Finished posts** the instant a call ends, via GLM — written in your voice, ready to copy & publish
- **One-click copy** per post, plus downloadable posts (`.md`) and transcript (`.txt`)
- **Web-only & stateless** — each session is self-contained: talk → posts → publish

## Architecture

```
server.js                   ← Express: serves the app + assistant config + post generation
docs/index.html             ← landing page + in-browser voice UI + posts results
docs/vapi.js                ← the Vapi Web SDK, bundled locally (no CDN) — see `npm run build:sdk`
interviewer-prompt.txt      ← THE HOST: identity, tone, how to interview (live)
ghostwriter-prompt.txt      ← THE GHOSTWRITER: turns the transcript into finished posts (after)
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/` | The app (landing page + voice UI; config auto-injected) |
| `POST` | `/webhook/assistant-request` | Returns the interviewer config (system prompt read from `interviewer-prompt.txt`) |
| `POST` | `/generate-posts` | Takes `{ transcript: [{role, text}] }`, runs the ghostwriter via GLM, returns `{ menu, posts: [...] }` |
| `GET`  | `/status` | Human-readable config status |
| `GET`  | `/healthz` | Health check |

The page's config (`VAPI_PUBLIC_KEY` + this server's own URLs) is **injected at request time**, so local and deployed both work with zero edits to the HTML.

## Prerequisites

- Node.js **v18+**
- A [Vapi](https://vapi.ai) account (you'll need the **public key**)
- A **GLM** API key (e.g. [Zhipu/BigModel](https://open.bigmodel.cn) — any OpenAI-compatible endpoint)

## Installation

```bash
git clone https://github.com/ianpilon/saymore-voice-agent.git
cd saymore-voice-agent
npm install
cp .env.example .env      # then paste your keys into .env (see below)
```

## Configuration (`.env`)

Open `.env` and paste your keys (it's gitignored, so secrets stay local):

```bash
PORT=7331

# Vapi public key (browser-side) — get it from the Vapi dashboard.
# Injected into the page automatically; you never edit the HTML.
VAPI_PUBLIC_KEY=your-vapi-public-key

# GLM (your LLM) — runs the ghostwriter, server-side only.
GLM_API_KEY=your-glm-key
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/   # Zhipu direct (or openrouter / siliconflow)
GLM_MODEL=glm-5.2                                    # exact string your provider expects

# Live interviewer model — runs natively INSIDE Vapi (uses your Vapi account).
# Gemini is used because Vapi has no native GLM provider.
VAPI_MODEL_PROVIDER=google
VAPI_MODEL=gemini-2.0-flash
```

### Tune the behavior

- **The interview:** edit `interviewer-prompt.txt`
- **The posts:** edit `ghostwriter-prompt.txt`
- **The voice:** `voice.voiceId` in `server.js` (e.g. `Elliot`)

### The bundled SDK

The Vapi Web SDK ships as CommonJS, so it can't load in a browser directly. `docs/vapi.js` is a self-contained bundle (built with esbuild) so the page has **no external-CDN dependency**. It's committed, so the app works out of the box. To rebuild it (e.g. after bumping `@vapi-ai/web`):

```bash
npm run build:sdk
```

## Running

```bash
npm start          # then open the printed URL (e.g. http://localhost:7331)
```

The server serves the app at `/`, so just open that URL in your browser. Click **Start talking**, allow the mic, have the conversation, click **End call**, and the ghostwriter writes your posts from your GLM key.

### Smoke test (no browser)

```bash
node test-webhook.js     # hits both endpoints with sample data (needs GLM_API_KEY)
```

## Deployment

Deploy **just the server** — no separate static host needed (it serves the page itself). `Dockerfile` and `render.yaml` are included.

Required env vars on your host: `GLM_API_KEY`, `VAPI_PUBLIC_KEY`. (The rest have sensible defaults — see `.env.example`.)

```bash
# Render: push to GitHub, create a Web Service from the repo, set the env vars.
# Or any container host: build the Dockerfile, set the env vars, expose the port.
```

Then open your deployed URL — the page auto-configures to that origin.

## Notes & next steps

- **No persistence (by design).** Each session is self-contained. To add a "library" of past posts later, key storage to an identity (email/phone).
- **Phone support** is intentionally absent for now. It slots into the existing webhook pattern later (store posts keyed to the caller's number, text them a link).
- The interviewer system prompt is delivered to the browser as part of the assistant config (inherent to Vapi's transient-assistant pattern). For a hardened deployment, move to a server-side assistant.

## License

MIT

# Saymore — Talk it out. Get the gold.

A voice agent that interviews you like a great podcast host — warm, curious, one question at a time — then mines the transcript for the raw, post-worthy **nuggets** worth turning into a LinkedIn post. Built on [Vapi](https://vapi.ai). **Helping you share your voice.**

![Saymore](docs/screenshot.png)

**Live:** https://saymore.voiceclaw.ca

## The idea

Your best ideas come out when you talk, not when you stare at a blank page. Saymore is a two-stage pipeline:

1. **The interview (live, voice).** A conversational agent opens a few doors ("something you figured out, someone who impressed you, an opinion you're chewing on"), then follows its curiosity — reacting before it asks, chasing specifics, pulling for real numbers and turning points. The sacred rule: the interviewer has *no idea* it's mining for content. It never steers you toward sounding polished. It just gets true, vivid material out of you.
2. **The nugget report (after the call).** The moment you hang up, a second agent reads the whole transcript and extracts ranked **nuggets** — each tagged Learning / Shout-out / Hot take / Story, with a hook, why it works, **verbatim quotes**, and the specifics to build with. Extract, never invent. You download it as Markdown.

The two stages are deliberately decoupled: the conversation stays authentic because the host isn't performing for an output; the editor does all the judgment afterward.

## The two LLMs

| Stage | Model | Where it runs | Key |
|---|---|---|---|
| **Live interview** | Gemini 2.0 Flash | Inside Vapi (native provider) | just your Vapi account |
| **Nugget extraction** | GLM 5.2 | On your server, via its OpenAI-compatible endpoint | your GLM/Zhipu key |

Vapi has no native GLM/Zhipu provider, so the live call uses Vapi-native **Gemini** (zero extra setup, works with just a Vapi account). The post-call nugget mining runs on **GLM** via Zhipu's OpenAI-compatible endpoint. No OpenAI anywhere.

## Features

- **Live voice interview** in the browser (Vapi Web SDK) — no phone, no app to install
- **Zero-CDN**: the Vapi SDK is bundled locally (`docs/vapi.js`) so it works on networks that block `esm.sh`
- **Auto-configured**: the server serves the page and injects config — no hand-editing URLs or keys into the HTML
- **Automatic nugget extraction** the instant a call ends, via GLM
- **Four nugget categories**: Learning, Shout-out, Hot take, Story
- **Verbatim quotes** pulled exactly as you said them — the raw material a writer builds from
- **Downloadable report** (`.md`) and transcript (`.txt`)
- **Web-only & stateless** — each session is self-contained: talk → nuggets → download

## Architecture

```
server.js                   ← Express: serves the app + assistant config + nugget extraction
docs/index.html             ← landing page + in-browser voice UI + nuggets results
docs/vapi.js                ← the Vapi Web SDK, bundled locally (no CDN) — see `npm run build:sdk`
interviewer-prompt.txt      ← THE HOST: identity, tone, how to interview (live)
nugget-extractor-prompt.txt ← THE EDITOR: how to mine a transcript into nuggets (after)
```

Routes:

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/` | The app (landing page + voice UI; config auto-injected) |
| `POST` | `/webhook/assistant-request` | Returns the interviewer config (system prompt read from `interviewer-prompt.txt`) |
| `POST` | `/extract-nuggets` | Takes `{ transcript: [{role, text}] }`, runs the editor via GLM, returns `{ read, nuggets: [...] }` |
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

# GLM (your LLM) — runs the nugget extractor, server-side only.
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
- **The nuggets:** edit `nugget-extractor-prompt.txt`
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

The server serves the app at `/`, so just open that URL in your browser. Click **Start talking**, allow the mic, have the conversation, click **End call**, and the nuggets mine from your GLM key.

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

- **No persistence (by design).** Each session is self-contained. To add a "library" of past nuggets later, key storage to an identity (email/phone).
- **Phone support** is intentionally absent for now. It slots into the existing webhook pattern later (store nuggets keyed to the caller's number, text them a link).
- The interviewer system prompt is delivered to the browser as part of the assistant config (inherent to Vapi's transient-assistant pattern). For a hardened deployment, move to a server-side assistant.

## License

MIT

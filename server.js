require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const OpenAI = require('openai').default; // GLM exposes an OpenAI-compatible API, so we reuse this SDK

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// CORS — the static landing page (GitHub Pages / local) calls this server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use((req, res, next) => {
  console.log(`\n📨 ${req.method} ${req.path}`);
  next();
});

// ============================================================
// Prompts — read once at boot. Edit the .txt files to tune behavior.
// ============================================================
const INTERVIEWER_PROMPT = fs.readFileSync(
  path.join(__dirname, 'interviewer-prompt.txt'),
  'utf8'
);
const EXTRACTOR_PROMPT = fs.readFileSync(
  path.join(__dirname, 'nugget-extractor-prompt.txt'),
  'utf8'
);

// ============================================================
// GLM client (server-side only — key never reaches the browser)
// GLM is OpenAI-compatible, so we point the OpenAI SDK at your
// provider's base URL. Works with Zhipu, OpenRouter, SiliconFlow, etc.
// ============================================================
function isPlaceholder(v) {
  return !v || /paste|replace|your[-_]|xxx|example|sk-replace/i.test(v);
}

const GLM_API_KEY  = process.env.GLM_API_KEY;
const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';
const GLM_MODEL    = process.env.GLM_MODEL || 'glm-5.2';

const llm = isPlaceholder(GLM_API_KEY)
  ? null
  : new OpenAI({ apiKey: GLM_API_KEY, baseURL: GLM_BASE_URL });

// ── Live interviewer model (runs INSIDE Vapi during the call) ──
// Vapi must support the provider you set here. Defaults kept inert so the
// server still boots. Tell me your GLM gateway and I'll set this correctly
// (e.g. provider "openrouter", or a custom proxy for Zhipu direct).
// Live interviewer runs natively inside Vapi (works with just your Vapi key,
// like Untangle). Gemini chosen since you're off OpenAI. Tune the exact model
// string in .env (VAPI_MODEL) if your Vapi account expects a different one.
const VAPI_MODEL_PROVIDER = process.env.VAPI_MODEL_PROVIDER || 'google';
const VAPI_MODEL          = process.env.VAPI_MODEL || 'gemini-2.0-flash';

// Vapi public key (browser-side). Injected into the landing page when the
// server serves it, so you never edit the page's CONFIG by hand.
// Get it from the Vapi dashboard.
const VAPI_PUBLIC_KEY = isPlaceholder(process.env.VAPI_PUBLIC_KEY) ? '' : process.env.VAPI_PUBLIC_KEY;

// The interviewer's opening line. Clean of any downstream "content" framing.
const FIRST_MESSAGE =
  "Hey, good to talk to you. Think of this as a casual interview — I'll just ask questions and follow whatever's interesting. There's no wrong place to start. So, what's on your mind today? Could be something you figured out recently, someone who impressed you, or an opinion you've been chewing on. Where do you want to start?";

// ============================================================
// 1) Assistant config (transient assistant pattern, web-only)
// ============================================================
app.post('/webhook/assistant-request', (req, res) => {
  console.log('🔍 assistant-request payload:', JSON.stringify(req.body, null, 2));

  const assistant = {
    name: 'Saymore Interviewer',
    firstMessage: FIRST_MESSAGE,
    model: {
      provider: VAPI_MODEL_PROVIDER,
      model: VAPI_MODEL,
      temperature: 0.8,
      messages: [{ role: 'system', content: INTERVIEWER_PROMPT }],
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en',
    },
    // Web SDK requires an inline voice.
    voice: { provider: 'vapi', voiceId: 'Elliot' },
    endCallPhrases: [
      'goodbye', 'bye', "we're good", "that's plenty", "i'm good",
      'talk soon', 'that was great', 'we can stop there',
    ],
    maxDurationSeconds: 1800,
    backgroundSound: 'off',
    backchannelingEnabled: true,
    backgroundDenoisingEnabled: true,
    recordingEnabled: false,
  };

  return res.json({ assistant });
});

// ============================================================
// 2) Nugget extraction — runs AFTER the call, over the transcript,
//    via your GLM endpoint.
// ============================================================
async function callExtractor(transcriptText) {
  const baseMessages = [
    { role: 'system', content: EXTRACTOR_PROMPT },
    {
      role: 'user',
      content:
        'Here is the raw interview transcript. Mine it for nuggets per the rules.\n\n' +
        '=== TRANSCRIPT ===\n' +
        transcriptText,
    },
  ];

  let raw;
  // Prefer structured JSON mode; fall back to plain text if this GLM
  // variant or gateway doesn't support response_format.
  try {
    const c = await llm.chat.completions.create({
      model: GLM_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: baseMessages,
    });
    raw = c.choices[0].message.content;
  } catch (err) {
    console.warn('⚠️  JSON mode unavailable, retrying plain text:', err.message);
    const c = await llm.chat.completions.create({
      model: GLM_MODEL,
      temperature: 0.4,
      messages: baseMessages,
    });
    raw = (c.choices[0].message.content || '')
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  try {
    return JSON.parse(raw);
  } catch (e) {
    return { read: 'The extractor returned unexpected output.', _raw: raw };
  }
}

app.post('/extract-nuggets', async (req, res) => {
  const transcript = req.body && req.body.transcript;

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return res
      .status(400)
      .json({ error: 'Missing "transcript" (array of {role, text}).' });
  }
  if (!llm) {
    return res
      .status(500)
      .json({ error: 'GLM_API_KEY is not set on the server (see .env).' });
  }

  const lines = transcript
    .filter((m) => m && (m.text || m.message))
    .map((m) => `${m.role === 'user' ? 'Them' : 'Interviewer'}: ${m.text || m.message}`)
    .join('\n');

  if (!lines.trim()) {
    return res.status(400).json({ error: 'Transcript had no speakable lines.' });
  }

  console.log(`⛏️  Extracting nuggets from ${transcript.length} lines via ${GLM_MODEL}…`);

  try {
    const parsed = await callExtractor(lines);
    console.log(`✅ Extracted ${(parsed.nuggets || []).length} nugget(s).`);
    return res.json(parsed);
  } catch (err) {
    console.error('❌ Nugget extraction failed:', err);
    return res
      .status(500)
      .json({ error: 'Nugget extraction failed.', detail: err.message });
  }
});

// ============================================================
// Serve the app + status + health
// ============================================================
const DOCS_DIR = path.join(__dirname, 'docs');

function getOrigin(req) {
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

// Serve the landing page at the root. Config (public key + this origin's
// URLs) is injected, so local AND deployed both work with zero page edits.
app.get('/', (req, res) => {
  const origin = getOrigin(req);
  let html;
  try {
    html = fs.readFileSync(path.join(DOCS_DIR, 'index.html'), 'utf8');
  } catch (e) {
    return res.status(500).send('docs/index.html not found');
  }
  const config = `<script>window.__SAYMORE_CONFIG__=${JSON.stringify({
    VAPI_PUBLIC_KEY: VAPI_PUBLIC_KEY,
    ASSISTANT_API: `${origin}/webhook/assistant-request?web=1`,
    EXTRACT_NUGGETS_API: `${origin}/extract-nuggets`,
  })};</script>`;
  res.set('Cache-Control', 'no-store'); // never cache — config is injected per request
  res.type('html').send(html.replace('</head>', config + '</head>'));
});

// Serve locally-bundled static assets (e.g. /vapi.js) so the page has zero
// external-CDN dependency — works behind networks that block esm.sh.
app.use(express.static(DOCS_DIR));

app.get('/status', (req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><title>Saymore — status</title>
<style>body{font-family:system-ui;max-width:640px;margin:40px auto;padding:0 20px;color:#222}
code{background:#f3f3f3;padding:2px 6px;border-radius:4px}
.ok{color:#0a7d2e;font-weight:600}
.bad{color:#b00;font-weight:600}
.meta{color:#666;font-size:14px}</style></head>
<body>
<h1>Saymore</h1>
<p class="ok">Server is running on port ${port}.</p>
<p class="meta">Extractor: <strong>${GLM_MODEL}</strong> @ ${GLM_BASE_URL} — ${llm ? '<span class=ok>configured</span>' : '<span class=bad>set GLM_API_KEY in .env</span>'}</p>
<p class="meta">Live interviewer (Vapi): <strong>${VAPI_MODEL_PROVIDER}/${VAPI_MODEL}</strong></p>
<p class="meta">Vapi public key: ${VAPI_PUBLIC_KEY ? '<span class=ok>set</span>' : '<span class=bad>set VAPI_PUBLIC_KEY in .env</span>'}</p>
<h3>Endpoints</h3>
<ul>
  <li><a href="/"><strong>GET /</strong></a> — the app (landing page + voice UI)</li>
  <li><code>POST /webhook/assistant-request</code> — interviewer config</li>
  <li><code>POST /extract-nuggets</code> — runs the editor over a transcript via GLM</li>
  <li><a href="/healthz">GET /healthz</a> — health</li>
</ul>
<p class="meta">Helping you share your voice.</p>
</body></html>`);
});

app.get('/healthz', (req, res) =>
  res.json({ ok: true, glm: !!llm, model: GLM_MODEL })
);

// ============================================================
// Startup
// ============================================================
app.listen(port, () => {
  console.log('\n🎙️  Saymore Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Server:        http://localhost:${port}`);
  console.log(`⛏️  Extractor:     ${GLM_MODEL} @ ${GLM_BASE_URL}`);
  console.log(`🗣️  Live (Vapi):   ${VAPI_MODEL_PROVIDER}/${VAPI_MODEL}`);
  console.log(`🔑 GLM:           ${llm ? 'configured' : '⚠️  NOT configured (set GLM_API_KEY in .env)'}`);
  console.log(`🎯 Assistant cfg: POST /webhook/assistant-request`);
  console.log(`✨ Nuggets:       POST /extract-nuggets`);
  console.log(`❤️  Health:       GET /healthz`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

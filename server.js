require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

const OpenAI = require('openai').default;

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
// OpenAI client (server-side only — key never reaches the browser)
// ============================================================
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const INTERVIEWER_MODEL = process.env.INTERVIEWER_MODEL || 'gpt-4o';
const EXTRACTOR_MODEL = process.env.EXTRACTOR_MODEL || 'gpt-4o';

// The interviewer's opening line. Kept clean of any downstream "content"
// framing — it's just a warm conversation opener with a few doors.
const FIRST_MESSAGE =
  "Hey, good to talk to you. Think of this as a casual interview — I'll just ask questions and follow whatever's interesting. There's no wrong place to start. So, what's on your mind today? Could be something you figured out recently, someone who impressed you, or an opinion you've been chewing on. Where do you want to start?";

// ============================================================
// 1) Assistant config (transient assistant pattern, web-only)
//    The browser POSTs here, gets the interviewer config back, and
//    starts the Vapi Web call with it.
// ============================================================
app.post('/webhook/assistant-request', (req, res) => {
  console.log('🔍 assistant-request payload:', JSON.stringify(req.body, null, 2));

  const assistant = {
    name: 'Saymore Interviewer',
    firstMessage: FIRST_MESSAGE,
    model: {
      provider: 'openai',
      model: INTERVIEWER_MODEL,
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
// 2) Nugget extraction — runs AFTER the call, over the transcript
//    The browser sends the captured transcript; we run the editor
//    prompt via OpenAI and return structured nuggets.
// ============================================================
app.post('/extract-nuggets', async (req, res) => {
  const transcript = req.body && req.body.transcript;

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return res
      .status(400)
      .json({ error: 'Missing "transcript" (array of {role, text}).' });
  }
  if (!openai) {
    return res
      .status(500)
      .json({ error: 'OPENAI_API_KEY is not set on the server.' });
  }

  const lines = transcript
    .filter((m) => m && (m.text || m.message))
    .map((m) => `${m.role === 'user' ? 'Them' : 'Interviewer'}: ${m.text || m.message}`)
    .join('\n');

  if (!lines.trim()) {
    return res.status(400).json({ error: 'Transcript had no speakable lines.' });
  }

  console.log(`⛏️  Extracting nuggets from ${transcript.length} lines…`);

  try {
    const completion = await openai.chat.completions.create({
      model: EXTRACTOR_MODEL,
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: EXTRACTOR_PROMPT },
        {
          role: 'user',
          content:
            'Here is the raw interview transcript. Mine it for nuggets per the rules.\n\n' +
            '=== TRANSCRIPT ===\n' +
            lines,
        },
      ],
    });

    const raw = completion.choices[0].message.content;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn('⚠️  Extractor did not return valid JSON; returning raw.');
      return res.json({ read: 'The extractor returned unexpected output.', _raw: raw });
    }

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
// Status + health
// ============================================================
app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html><head><title>Saymore</title>
<style>body{font-family:system-ui;max-width:640px;margin:40px auto;padding:0 20px;color:#222}
code{background:#f3f3f3;padding:2px 6px;border-radius:4px}
.ok{color:#0a7d2e;font-weight:600}
.meta{color:#666;font-size:14px}</style></head>
<body>
<h1>Saymore</h1>
<p class="ok">Server is running on port ${port}.</p>
<p class="meta">Interviewer model: <strong>${INTERVIEWER_MODEL}</strong> · Extractor model: <strong>${EXTRACTOR_MODEL}</strong></p>
<p class="meta">OpenAI: ${openai ? 'configured' : '⚠️ not configured (set OPENAI_API_KEY)'}</p>
<h3>Endpoints</h3>
<ul>
  <li><code>POST /webhook/assistant-request</code> — returns the interviewer config (called by the browser)</li>
  <li><code>POST /extract-nuggets</code> — runs the editor over a transcript, returns nuggets</li>
  <li><a href="/healthz">GET /healthz</a> — keep-alive ping target</li>
</ul>
<p class="meta">Helping you share your voice.</p>
</body></html>`);
});

app.get('/healthz', (req, res) =>
  res.json({ ok: true, openai: !!openai })
);

// ============================================================
// Startup
// ============================================================
app.listen(port, () => {
  console.log('\n🎙️  Saymore Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Server:        http://localhost:${port}`);
  console.log(`🗣️  Interviewer:   ${INTERVIEWER_MODEL}`);
  console.log(`⛏️  Extractor:     ${EXTRACTOR_MODEL}`);
  console.log(`🔑 OpenAI:        ${openai ? 'configured' : '⚠️  NOT configured (set OPENAI_API_KEY)'}`);
  console.log(`🎯 Assistant cfg: POST /webhook/assistant-request`);
  console.log(`✨ Nuggets:       POST /extract-nuggets`);
  console.log(`❤️  Health:       GET /healthz`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

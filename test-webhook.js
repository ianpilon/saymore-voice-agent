// Smoke test for the Saymore server.
//   1. Hit /webhook/assistant-request — should return an interviewer config.
//   2. Hit /extract-nuggets with a tiny transcript — should return nuggets
//      (requires OPENAI_API_KEY to be set on the server).
//
// Usage:
//   npm start         # in one terminal
//   node test-webhook.js          # in another
//   BASE=http://localhost:3000 node test-webhook.js

const BASE = process.env.BASE || 'http://localhost:3000';

async function main() {
  console.log(`Testing Saymore server at ${BASE}\n`);

  // 1) Assistant config
  console.log('— POST /webhook/assistant-request —');
  const cfgRes = await fetch(`${BASE}/webhook/assistant-request?web=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { type: 'assistant-request' } }),
  });
  const cfg = await cfgRes.json();
  console.log('status:', cfgRes.status);
  console.log('firstMessage:', cfg.assistant?.firstMessage?.slice(0, 80) + '…');
  console.log('model:', cfg.assistant?.model?.model);
  console.log('voice:', cfg.assistant?.voice?.voiceId);
  console.log('system prompt length:', cfg.assistant?.model?.messages?.[0]?.content?.length);

  // 2) Nugget extraction (needs OPENAI_API_KEY on the server)
  console.log('\n— POST /extract-nuggets —');
  const sample = [
    { role: 'assistant', text: "So what's on your mind today?" },
    { role: 'user', text: "Honestly, the thing I keep coming back to is how much my first engineering manager changed my career. Nobody talks about him but he basically taught me how to think." },
    { role: 'assistant', text: "Oh interesting — what did he actually do? Give me a specific moment." },
    { role: 'user', text: "I shipped a bug to production that took the site down for 40 minutes on a Friday. I was 23, I thought I was fired. He didn't yell. He sat me down and said 'we're gonna do the postmortem together, and the rule is nobody's name goes in it.' That one sentence changed how I lead forever." },
  ];
  const nugRes = await fetch(`${BASE}/extract-nuggets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: sample }),
  });
  const nug = await nugRes.json();
  console.log('status:', nugRes.status);
  console.log('read:', nug.read);
  console.log('nuggets:', (nug.nuggets || []).length);
  if (nug.nuggets) {
    nug.nuggets.forEach((n, i) => {
      console.log(`  [${i + 1}] ${n.category} — ${n.hook}`);
      console.log(`       quotes: ${(n.key_quotes || []).length}`);
    });
  }
  if (nug.error) console.log('error:', nug.error, nug.detail || '');
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});

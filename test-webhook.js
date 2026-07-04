// Smoke test for the Saymore server.
//   1. Hit /webhook/assistant-request — should return the interviewer config.
//   2. Hit /generate-posts with a tiny transcript — should return finished
//      LinkedIn posts (requires GLM_API_KEY to be set on the server).
//
// Usage:
//   npm start                       # in one terminal
//   node test-webhook.js            # in another
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
  console.log('firstMessage:', (cfg.assistant?.firstMessage || '').slice(0, 80) + '…');
  console.log('model:', cfg.assistant?.model?.model);
  console.log('voice:', cfg.assistant?.voice?.voiceId);
  console.log('system prompt length:', cfg.assistant?.model?.messages?.[0]?.content?.length);

  // 2) Post generation (needs GLM_API_KEY on the server)
  console.log('\n— POST /generate-posts —');
  const sample = [
    { role: 'assistant', text: "So what's on your mind today?" },
    { role: 'user', text: "Honestly, the thing I keep coming back to is how much my first engineering manager changed my career. Nobody talks about him but he basically taught me how to think." },
    { role: 'assistant', text: "Oh interesting — what did he actually do? Give me a specific moment." },
    { role: 'user', text: "I shipped a bug to production that took the site down for 40 minutes on a Friday. I was 23, I thought I was fired. He didn't yell. He sat me down and said 'we're gonna do the postmortem together, and the rule is nobody's name goes in it.' That one sentence changed how I lead forever." },
    { role: 'assistant', text: "Wait, nobody's name goes in it? Why did that land so hard?" },
    { role: 'user', text: "Because every other place I'd worked, the whole game was finding whose fault it was. He made the enemy the bug, not the person. Once I saw that I started running my own teams that way — retention went way up." },
  ];
  const res = await fetch(`${BASE}/generate-posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: sample }),
  });
  const data = await res.json();
  console.log('status:', res.status);
  console.log('menu:', data.menu);
  console.log('posts:', (data.posts || []).length);
  if (data.posts) {
    data.posts.forEach((p, i) => {
      console.log(`\n  [${i + 1}] ${p.name}`);
      console.log(`      words: ${String(p.post || '').trim().split(/\s+/).filter(Boolean).length}`);
      console.log(`      --- post ---\n${p.post}\n      --- end ---`);
      if (p.needs && p.needs.length) console.log(`      needs: ${p.needs.join(' | ')}`);
    });
  }
  if (data.error) console.log('error:', data.error, data.detail || '');
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});

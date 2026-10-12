// One-shot smoke test: hits NVIDIA NIM with a tiny prompt using the
// active env-injected key, prints whether we got a usable response, and
// exits. NEVER stores the key – caller must inject via env.
//
//   $env:NVIDIA_API_KEY = "<key>"
//   node scripts/smoke-nvidia.mjs nvidia/nemotron-3-super-120b-a12b
//
// This is the smallest possible check that the chosen model returns a
// usable `content` (or at least a non-empty message of any kind).

import OpenAI from 'openai';

const model = process.argv[2] || process.env.NVIDIA_PRIMARY_MODEL || 'nvidia/nemotron-3-super-120b-a12b';
const apiKey = process.env.NVIDIA_API_KEY;
if (!apiKey) {
  console.error('[smoke] NVIDIA_API_KEY is missing in env.');
  process.exit(2);
}

const client = new OpenAI({ apiKey, baseURL: 'https://integrate.api.nvidia.com/v1' });

(async () => {
  const started = Date.now();
  try {
    const completion = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: 'system', content: 'You are a concise assistant.' },
          { role: 'user', content: 'Reply with the single word: pong' },
        ],
        temperature: 0,
        max_tokens: 16,
      },
      { timeout: 30_000 },
    );

    const choice = completion.choices?.[0];
    const msg = choice?.message ?? {};
    const text =
      (typeof msg.content === 'string' && msg.content) ||
      (typeof msg.reasoning_content === 'string' && msg.reasoning_content) ||
      (Array.isArray(msg.content)
        ? msg.content.map((p) => p?.text || '').join('\n')
        : '');

    const durationMs = Date.now() - started;
    console.log('[smoke] model=%s durationMs=%d finishReason=%s', model, durationMs, choice?.finish_reason);
    console.log('[smoke] response=%j', text.slice(0, 200));
    if (!text) {
      console.error('[smoke] FAIL: empty response from model');
      process.exit(3);
    }
    process.exit(0);
  } catch (err) {
    console.error('[smoke] FAIL:', err?.message || err);
    process.exit(4);
  }
})();

import OpenAI from 'openai';

const key = process.env.NVIDIA_API_KEY || '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';
const client = new OpenAI({ apiKey: key, baseURL: 'https://integrate.api.nvidia.com/v1' });

// Test 1: non-streaming with skip_reasoning and json_object mode
console.log('Test 1: Non-streaming + skip_reasoning + json_object');
try {
  const r = await client.chat.completions.create({
    model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    messages: [{ role: 'user', content: 'Return only: {"test":true}' }],
    temperature: 0.1,
    max_tokens: 50,
    chat_template_kwargs: { skip_reasoning: true },
    response_format: { type: 'json_object' },
  });
  console.log('content:', (r.choices[0]?.message?.content || '(empty)').slice(0, 200));
  console.log('reasoning:', (r.choices[0]?.message?.reasoning_content || '(empty)').slice(0, 200));
} catch (e) {
  console.error('ERROR:', e.status, (e.message || '').slice(0, 120));
}

// Test 2: non-streaming with skip_reasoning, no json_object
console.log('\nTest 2: Non-streaming + skip_reasoning, no json_object mode');
try {
  const r = await client.chat.completions.create({
    model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
    messages: [{ role: 'user', content: 'Return ONLY this JSON, no other text:\n{"summary":"test","riskScore":42}' }],
    temperature: 0.1,
    max_tokens: 50,
    chat_template_kwargs: { skip_reasoning: true },
  });
  console.log('content:', (r.choices[0]?.message?.content || '(empty)').slice(0, 200));
  console.log('reasoning:', (r.choices[0]?.message?.reasoning_content || '(empty)').slice(0, 200));
} catch (e) {
  console.error('ERROR:', e.status, (e.message || '').slice(0, 120));
}

// Test 3: super-120b non-streaming (may be overloaded but try)
console.log('\nTest 3: super-120b non-streaming + skip_reasoning');
try {
  const r = await client.chat.completions.create({
    model: 'nvidia/nemotron-3-super-120b-a12b',
    messages: [{ role: 'user', content: 'Return ONLY this JSON, no other text:\n{"summary":"test","riskScore":42}' }],
    temperature: 0.1,
    max_tokens: 50,
    chat_template_kwargs: { skip_reasoning: true },
  });
  console.log('content:', (r.choices[0]?.message?.content || '(empty)').slice(0, 200));
  console.log('reasoning:', (r.choices[0]?.message?.reasoning_content || '(empty)').slice(0, 200));
} catch (e) {
  console.error('ERROR:', e.status, (e.message || '').slice(0, 120));
}

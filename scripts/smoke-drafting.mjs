// One-shot end-to-end smoke test against the production drafting pipeline.
//
//   $env:NVIDIA_API_KEY = "<key>"
//   node scripts/smoke-drafting.mjs
//
// Calls the same chatCompletion() that /api/drafting uses, but with a
// short drafting-shaped prompt so we can verify the *real* model output
// without spending the full 8k-token budget. Prints the raw text and
// the result of running it through parseJsonResponse + parseContractDraft.
//
// The key is read from env only — never persisted or logged.

import { writeFileSync } from 'node:fs';
import { chatCompletion, parseJsonResponse, NVIDIA_MODELS } from '../lib/nvidia-client.ts';
import { AIContractDrafter } from '../lib/ai-contract-drafter.ts';

(async () => {
  if (!process.env.NVIDIA_API_KEY) {
    console.error('[smoke-draft] NVIDIA_API_KEY missing');
    process.exit(2);
  }

  console.log('[smoke-draft] active primary model=%s', NVIDIA_MODELS.primary);

  // 1) Sanity probe: short JSON task with skip_reasoning.
  const probe = await chatCompletion(
    [
      { role: 'system', content: 'You output only JSON.' },
      { role: 'user', content: 'Return JSON: {"ping":"pong"}. No other text.' },
    ],
    { maxTokens: 64, temperature: 0 },
  );
  console.log('[smoke-draft] probe model=%s text=%j', probe.model, probe.text);

  // 2) Direct raw call: same prompt the drafter uses, with a low max_tokens
  //    ceiling so we can see how the model formats its output.
  const draftingPrompt = `
You are an expert legal AI that drafts complete, professional contracts.

CONTRACT REQUIREMENTS:
- Type: SaaS Subscription Agreement
- Party 1: Acme Inc. (Provider) - United States
- Party 2: Beta LLC (Customer) - United States
- Description: $99/month, 5 users, 99.9% uptime.
- Duration: 12 months
- Payment Terms: monthly

Return ONLY a single JSON object wrapped in a \`\`\`json fence. Include a
top-level "title", "fullText", and "sections" array with 3 entries
(Party 1 obligations, Party 2 obligations, payment). Each section has
"number", "title", "content", "category", "importance", "alternatives".
Do not include any reasoning or commentary.`;

  const started = Date.now();
  const call = await chatCompletion(
    [{ role: 'user', content: draftingPrompt }],
    {
      maxTokens: 4096,
      temperature: 0.5,
      timeoutMs: 120_000,
    },
  );
  const durationMs = Date.now() - started;
  console.log(
    '[smoke-draft] raw call model=%s finishReason=%s durationMs=%d len=%d',
    call.model,
    call.finishReason,
    durationMs,
    call.text.length,
  );

  writeFileSync('tmp-smoke-raw.txt', call.text, 'utf8');
  console.log('[smoke-draft] raw text head=%j', call.text.slice(0, 240).replace(/\n+/g, ' / '));
  console.log('[smoke-draft] raw text tail=%j', call.text.slice(-240).replace(/\n+/g, ' / '));

  // 3) Run the raw text through parseJsonResponse (the path the drafter uses).
  try {
    const parsed = parseJsonResponse(call.text);
    console.log('[smoke-draft] parseJsonResponse ok keys=%j', Object.keys(parsed));
  } catch (e) {
    console.error('[smoke-draft] parseJsonResponse FAIL: %s', e?.message || e);
  }

  // 4) Drive the full drafter to see if a *real* draft is producible.
  //    First, capture the raw AI response (so we can see what the model
  //    actually emitted), then run the drafter class to confirm parsing.
  try {
    // Manually invoke the same prompt the drafter uses, then write it.
    const { AIContractDrafter: Acd } = await import('../lib/ai-contract-drafter.ts');
    const drafter = new Acd();
    const prompt = drafter['buildDraftingPrompt']({
      contractType: 'SaaS Subscription Agreement',
      parties: {
        party1: { name: 'Acme Inc.', role: 'Provider', jurisdiction: 'United States' },
        party2: { name: 'Beta LLC', role: 'Customer', jurisdiction: 'United States' },
      },
      requirements: 'Monthly subscription at $99 per user, 5 users, 99.9% uptime.',
      keyTerms: { duration: '12 months', paymentTerms: 'monthly' },
      favorableFor: 'balanced',
      riskTolerance: 'moderate',
      complexity: 'simple',
      industry: 'Technology',
      jurisdiction: 'United States',
    });
    const rawDraftCall = await chatCompletion(
      [{ role: 'user', content: prompt }],
      { maxTokens: 6000, temperature: 0.7, timeoutMs: 120_000 },
    );
    writeFileSync('tmp-smoke-drafter-raw.txt', rawDraftCall.text, 'utf8');
    console.log(
      '[smoke-draft] drafter-raw model=%s len=%d finishReason=%s',
      rawDraftCall.model,
      rawDraftCall.text.length,
      rawDraftCall.finishReason,
    );
    console.log(
      '[smoke-draft] drafter-raw head=%j',
      rawDraftCall.text.slice(0, 240).replace(/\n+/g, ' / '),
    );
    console.log(
      '[smoke-draft] drafter-raw tail=%j',
      rawDraftCall.text.slice(-240).replace(/\n+/g, ' / '),
    );
  } catch (e) {
    console.error('[smoke-draft] drafter-raw probe FAIL: %s', e?.message || e);
  }

  try {
    const drafter = new AIContractDrafter();
    const draft = await drafter.draftContract({
      contractType: 'SaaS Subscription Agreement',
      parties: {
        party1: { name: 'Acme Inc.', role: 'Provider', jurisdiction: 'United States' },
        party2: { name: 'Beta LLC', role: 'Customer', jurisdiction: 'United States' },
      },
      requirements: 'Monthly subscription at $99 per user, 5 users, 99.9% uptime.',
      keyTerms: { duration: '12 months', paymentTerms: 'monthly' },
      favorableFor: 'balanced',
      riskTolerance: 'moderate',
      complexity: 'simple',
      industry: 'Technology',
      jurisdiction: 'United States',
    });
    console.log(
      '[smoke-draft] drafter ok title=%j sections=%d fullTextLen=%d',
      draft.title,
      draft.sections.length,
      draft.fullText.length,
    );
  } catch (e) {
    console.error('[smoke-draft] drafter FAIL: %s', e?.message || e);
    // Capture the raw text the drafter rejected so we can debug.
    try {
      const drafterProbe = await chatCompletion(
        [
          { role: 'system', content: 'You output only JSON.' },
          {
            role: 'user',
            content:
              'Draft a complete SaaS agreement JSON with the exact same fields the drafter asks for. Return ONLY a ```json fenced JSON object with title, fullText, sections (5 entries), missingClauses, legalCitations.',
          },
        ],
        { maxTokens: 6000, temperature: 0.7, timeoutMs: 120_000 },
      );
      writeFileSync('tmp-smoke-drafter-raw.txt', drafterProbe.text, 'utf8');
      console.log(
        '[smoke-draft] drafter-raw model=%s len=%d finishReason=%s',
        drafterProbe.model,
        drafterProbe.text.length,
        drafterProbe.finishReason,
      );
      console.log(
        '[smoke-draft] drafter-raw head=%j',
        drafterProbe.text.slice(0, 240).replace(/\n+/g, ' / '),
      );
      console.log(
        '[smoke-draft] drafter-raw tail=%j',
        drafterProbe.text.slice(-240).replace(/\n+/g, ' / '),
      );
    } catch (probeErr) {
      console.error('[smoke-draft] drafter-raw probe FAIL:', probeErr?.message || probeErr);
    }
  }
})();

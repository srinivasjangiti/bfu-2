/**
 * Unit tests for AIContractDrafter's pure parsing/validation methods.
 * Validates that a synthetic "good" AI response produces a structurally
 * valid DraftedContract, and that malformed / empty responses surface a
 * clear error rather than silently returning a half-populated object.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AIContractDrafter } from '../../lib/ai-contract-drafter.ts';
import type { ContractDraftRequest } from '../../lib/ai-contract-drafter.ts';

const baseRequest: ContractDraftRequest = {
  contractType: 'SaaS Subscription Agreement',
  parties: {
    party1: { name: 'Acme Inc.', role: 'Provider', jurisdiction: 'United States' },
    party2: { name: 'Beta LLC', role: 'Customer', jurisdiction: 'United States' },
  },
  requirements: 'SaaS subscription at $99/month per user, 99.9% uptime SLA.',
  keyTerms: {
    duration: '12 months',
    paymentTerms: 'monthly',
    deliverables: ['cloud access'],
    specialClauses: ['SLA'],
  },
  favorableFor: 'balanced',
  riskTolerance: 'moderate',
  complexity: 'standard',
  industry: 'Technology',
  jurisdiction: 'United States',
};

const goodResponse = `\`\`\`json
{
  "title": "SaaS Subscription Agreement",
  "fullText": "This SaaS Subscription Agreement is entered into between Acme Inc. and Beta LLC.\\n\\n1. Definitions\\nFor purposes of this Agreement...\\n\\n2. Scope of Work\\nProvider shall deliver...\\n\\n13. Signature\\nACME INC.\\nBY: ____\\nDATE: ____",
  "sections": [
    {"number":"1","title":"Parties","content":"Identification of the parties to this Agreement.","category":"parties","importance":"important","alternatives":[]},
    {"number":"2","title":"Definitions","content":"For purposes of this Agreement, the following terms...","category":"definitions","importance":"important","alternatives":[]},
    {"number":"3","title":"Scope of Work","content":"Provider shall deliver...","category":"scope","importance":"critical","alternatives":[]},
    {"number":"4","title":"Payment Terms","content":"Customer shall pay...","category":"payment","importance":"critical","alternatives":[]},
    {"number":"5","title":"Term and Termination","content":"Term is 12 months...","category":"term","importance":"critical","alternatives":[]},
    {"number":"6","title":"Intellectual Property","content":"Each party retains...","category":"ip","importance":"important","alternatives":[]},
    {"number":"7","title":"Confidentiality","content":"Each party agrees...","category":"confidentiality","importance":"critical","alternatives":[]},
    {"number":"8","title":"Warranties","content":"Provider warrants...","category":"warranty","importance":"important","alternatives":[]},
    {"number":"9","title":"Limitation of Liability","content":"Total liability...","category":"liability","importance":"critical","alternatives":[]},
    {"number":"10","title":"Indemnification","content":"Each party indemnifies...","category":"liability","importance":"important","alternatives":[]},
    {"number":"11","title":"Dispute Resolution","content":"Disputes shall be...","category":"dispute","importance":"important","alternatives":[]},
    {"number":"12","title":"General Provisions","content":"Notices, governing law...","category":"general","importance":"standard","alternatives":[]},
    {"number":"13","title":"Signatures","content":"Signed by:","category":"signatures","importance":"critical","alternatives":[]}
  ],
  "clauseExplanations": {"Section 9": "Caps provider exposure"},
  "designDecisions": ["Chose arbitration"],
  "missingClauses": [],
  "legalCitations": []
}
\`\`\``;

test('parseContractDraft produces a complete DraftedContract for a valid response', () => {
  const drafter = new AIContractDrafter();
  const draft = drafter.parseContractDraft(goodResponse, baseRequest);

  assert.equal(draft.title, 'SaaS Subscription Agreement');
  assert.ok(draft.fullText.length > 200, 'fullText should be substantial');
  assert.ok(Array.isArray(draft.sections));
  assert.equal(draft.sections.length, 13);
  assert.equal(draft.signatures.length, 2);
  assert.ok(draft.generatedAt instanceof Date);
  assert.ok(typeof draft.model === 'string' && draft.model.length > 0);
});

test('validateDraft marks every standard clause as present when response covers them all', async () => {
  const drafter = new AIContractDrafter();
  const draft = drafter.parseContractDraft(goodResponse, baseRequest);
  const validated = await drafter.validateDraft(draft);

  // Section #1 in the fixture is titled "Parties" specifically so the
  // "parties" keyword is covered. Everything else matches one of the
  // required keywords too.
  assert.equal(
    validated.missingClauses.length,
    0,
    `Expected no missing keywords, got: ${validated.missingClauses.join(', ')}`,
  );
  assert.equal(validated.completeness, 100);
});

test('parseContractDraft throws when the AI response is not JSON', () => {
  const drafter = new AIContractDrafter();
  assert.throws(
    () => drafter.parseContractDraft('hello there, no JSON', baseRequest),
    /non-JSON/,
  );
});

test('parseContractDraft repairs a truncated raw JSON object gracefully', () => {
  const drafter = new AIContractDrafter();
  // Truncated at "alternatives":[] – the JSON repair should close the
  // remaining open braces so the parser succeeds.
  const truncated = '{"title":"Mini","fullText":"hi","sections":[{"number":"1","title":"Pay","content":"x","category":"payment","importance":"critical","alternatives":[]}';
  const draft = drafter.parseContractDraft(truncated, baseRequest);
  assert.equal(draft.title, 'Mini');
  assert.equal(draft.fullText, 'hi');
  assert.ok(Array.isArray(draft.sections));
  assert.ok(draft.sections.length >= 1);
});

test('parseContractDraft returns safe defaults for missing optional fields', () => {
  const drafter = new AIContractDrafter();
  const minimal = '```json\n{"title":"Bare"}\n```';
  const draft = drafter.parseContractDraft(minimal, baseRequest);
  assert.equal(draft.title, 'Bare');
  assert.equal(draft.fullText, '');
  assert.deepEqual(draft.sections, []);
  assert.deepEqual(draft.signatures.length > 0, true);
  assert.deepEqual(draft.legalCitations, []);
});

test('parseContractDraft recovers from a thinking preamble before JSON', () => {
  const drafter = new AIContractDrafter();
  const responseWithPreamble =
    'We need to draft a SaaS agreement. Let me start with the parties...\n' +
    'Actually, I should define the structure first.\n' +
    '```json\n{"title":"Recovered","fullText":"body text","sections":[]}\n```';
  const draft = drafter.parseContractDraft(responseWithPreamble, baseRequest);
  assert.equal(draft.title, 'Recovered');
  assert.equal(draft.fullText, 'body text');
});

test('parseContractDraft recovers from inline JSON after prose', () => {
  const drafter = new AIContractDrafter();
  const response =
    'Reasoning: I will start with the preamble.\n{"title":"Inline","fullText":"hi","sections":[]}';
  const draft = drafter.parseContractDraft(response, baseRequest);
  assert.equal(draft.title, 'Inline');
  assert.equal(draft.fullText, 'hi');
});

test('validateDraft surfaces missing standard-clause keywords', async () => {
  const drafter = new AIContractDrafter();
  const partialResponse = `\`\`\`json
{
  "title": "Partial",
  "fullText": "Some preamble here",
  "sections": [
    {"number":"1","title":"Payment","content":"pay here","category":"payment","importance":"critical","alternatives":[]}
  ],
  "clauseExplanations": {},
  "designDecisions": [],
  "missingClauses": [],
  "legalCitations": []
}
\`\`\``;
  const draft = drafter.parseContractDraft(partialResponse, baseRequest);
  const validated = await drafter.validateDraft(draft);
  // Almost every standard keyword should be missing.
  assert.ok(validated.missingClauses.length > 5, 'most keywords should be missing');
  assert.ok(validated.completeness < 30, 'completeness should be low');
});

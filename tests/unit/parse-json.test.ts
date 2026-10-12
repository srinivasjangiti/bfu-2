/**
 * Unit tests for parseJsonResponse (pure JSON parser used by every AI caller).
 * Run with `node --experimental-strip-types --test tests/unit/parse-json.test.ts`
 * or via the new `npm run test:unit` script (added below).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseJsonResponse } from '../../lib/nvidia-client.ts';

test('parses fenced JSON', () => {
  const result = parseJsonResponse<{ hello: string }>('```json\n{"hello":"world"}\n```');
  assert.equal(result.hello, 'world');
});

test('parses bare JSON', () => {
  const result = parseJsonResponse<{ n: number }>('{"n":42}');
  assert.equal(result.n, 42);
});

test('extracts embedded JSON from prose (Nemotron-style preamble)', () => {
  // The parser now has a prose-extraction fallback: it finds the first '{' and
  // last '}' in the response and parses that slice. This handles models that
  // prepend explanatory text before the JSON payload.
  const result = parseJsonResponse<{ ok: boolean }>('Sure, here you go:\n{"ok":true}\n— done.');
  assert.equal(result.ok, true);
});

test('throws a descriptive error on truly malformed input (no JSON object)', () => {
  assert.throws(
    () => parseJsonResponse('no json here at all, just plain text without braces'),
    /Failed to parse AI response as JSON/,
  );
});

test('repairs truncated JSON by closing open objects', () => {
  const result = parseJsonResponse<{ a: number; b?: string }>('{"a":1,');
  assert.equal(result.a, 1);
});

test('repairs truncated JSON by closing open arrays', () => {
  const result = parseJsonResponse<number[]>('[1,2,3,');
  assert.deepEqual(result, [1, 2, 3]);
});

test('throws a descriptive error on truly malformed input', () => {
  assert.throws(
    () => parseJsonResponse('not-json-at-all'),
    /Failed to parse AI response as JSON/,
  );
});

test('handles JSON wrapped in plain triple backticks (no language tag)', () => {
  const result = parseJsonResponse<{ v: number }>('```\n{"v":7}\n```');
  assert.equal(result.v, 7);
});

test('recovers from a missing closing fence (truncated AI output)', () => {
  // The model ran out of tokens mid-output; the JSON inside the fence is
  // truncated too. We expect a repaired parse that closes the open object.
  // Note: the repair trims trailing whitespace from the input (which is
  // almost always a model-side newline), so we use a non-whitespace
  // payload marker instead of a literal trailing space.
  const truncated = '```json\n{"a":1,"b":"partial';
  const result = parseJsonResponse<{ a: number; b: string }>(truncated);
  assert.equal(result.a, 1);
  assert.equal(result.b, 'partial');
});

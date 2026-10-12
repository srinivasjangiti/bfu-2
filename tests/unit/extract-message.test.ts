/**
 * Unit tests for extractMessageText – the defensive content extractor at the
 * core of the NVIDIA client.
 *
 * Run with: node --experimental-strip-types --test tests/unit/extract-message.test.ts
 *
 * Why this matters: the original client only read `message.content`. Reason-
 * ing models (Nemotron, DeepSeek) surface their thinking under
 * `reasoning_content` and historically left `content` empty. After the
 * ContentExtraction fix this function never returns empty for a model
 * that produced ANY output, so subsequent parsing keeps working.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractMessageText } from '../../lib/nvidia-client.ts';

test('returns string content from the standard chat path', () => {
  const choice = { message: { role: 'assistant', content: 'hello world' } };
  assert.equal(extractMessageText(choice), 'hello world');
});

test('falls back to reasoning_content when content is missing (Nemotron)', () => {
  const choice = {
    message: {
      role: 'assistant',
      content: '',
      reasoning_content: 'thinking…\nfinal: hi',
    },
  };
  assert.equal(extractMessageText(choice), 'thinking…\nfinal: hi');
});

test('falls back to reasoning_content when content is undefined', () => {
  const choice = { message: { role: 'assistant', reasoning_content: 'final answer' } };
  assert.equal(extractMessageText(choice), 'final answer');
});

test('prefers content over reasoning_content when both present', () => {
  const choice = {
    message: {
      role: 'assistant',
      content: 'final answer',
      reasoning_content: 'irrelevant chain of thought',
    },
  };
  assert.equal(extractMessageText(choice), 'final answer');
});

test('joins multi-part content arrays (vision / structured)', () => {
  const choice = {
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'first part' },
        { type: 'text', text: 'second part' },
      ],
    },
  };
  assert.equal(extractMessageText(choice), 'first part\nsecond part');
});

test('returns empty when content is an empty array AND reasoning_content is absent', () => {
  const choice = { message: { role: 'assistant', content: [] } };
  assert.equal(extractMessageText(choice), '');
});

test('returns empty when message is missing', () => {
  assert.equal(extractMessageText({}), '');
});

test('returns empty when choice itself is nullish', () => {
  assert.equal(extractMessageText(null), '');
  assert.equal(extractMessageText(undefined), '');
});

test('does not crash on completely foreign shapes', () => {
  assert.equal(extractMessageText('a string'), '');
  assert.equal(extractMessageText(42), '');
  assert.equal(extractMessageText({ random: true }), '');
});

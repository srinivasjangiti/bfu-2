/**
 * NVIDIA NIM API Client
 *
 * Centralised OpenAI-compatible client for all NVIDIA NIM AI calls.
 * Docs: https://docs.api.nvidia.com
 *
 * All AI calls in the app go through this module so the key and base URL
 * are configured in one place and are NEVER exposed to the browser.
 *
 * Design notes
 * ------------
 *  - Model selection is server-side and env-driven. Defaults are chosen for
 *    NVIDIA NIM as of the most recent catalogue, but operators can pin a
 *    specific model with NVIDIA_PRIMARY_MODEL / NVIDIA_FALLBACK_MODEL /
 *    NVIDIA_FAST_MODEL without code changes.
 *  - Content extraction is defensive: it tolerates empty `content`,
 *    `reasoning_content` (DeepSeek / Nemotron reasoning models), and
 *    multi-part content arrays returned by some providers.
 *  - `safeGenerate()` retries on transient failures (network / 5xx /
 *    timeout / rate-limit) and falls back to the secondary model so a
 *    single retired model never hard-fails the whole AI surface.
 *  - Errors are typed so callers can distinguish missing-credentials,
 *    rate-limit, timeout, and upstream-model failures.
 */

import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Model catalogue (env-driven with safe defaults)
// ---------------------------------------------------------------------------

/**
 * Default model identifiers. These names reflect the NVIDIA NIM catalogue as
 * documented at https://docs.api.nvidia.com. The previous hard-coded Llama-3
 * IDs (3.3-70b / 3.1-70b / 3.1-8b) are no longer served; operators should
 * either rely on these defaults or override with NVIDIA_PRIMARY_MODEL and
 * NVIDIA_FALLBACK_MODEL env vars.
 *
 * Reasoning-model note: Nemotron Super 120B is a reasoning model. It can
 * surface its chain-of-thought under `reasoning_content` and the final
 * answer under `content`. The extractor below handles both. If you need a
 * pure non-reasoning model, override NVIDIA_PRIMARY_MODEL with a chat-tuned
 * model (e.g. `meta/llama-3.1-70b-instruct` if/when it returns to the
 * catalogue, or any non-reasoning Qwen / Mistral model).
 */
export const NVIDIA_MODELS = {
  primary: process.env.NVIDIA_PRIMARY_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
  fallback: process.env.NVIDIA_FALLBACK_MODEL || 'nvidia/nemotron-3.5-lightning-30b-a3b',
  fast: process.env.NVIDIA_FAST_MODEL || 'nvidia/nemotron-3-super-120b-a12b',
} as const;

const DEFAULT_NVIDIA_TIMEOUT_MS = Number.parseInt(
  process.env.NVIDIA_REQUEST_TIMEOUT_MS || '60000',
  10,
);

const DEFAULT_MAX_RETRIES = Number.parseInt(
  process.env.NVIDIA_MAX_RETRIES || '1',
  10,
);

// ---------------------------------------------------------------------------
// Typed errors – callers can branch on kind without parsing strings.
// ---------------------------------------------------------------------------

export type NvidiaErrorKind =
  | 'missing_credentials'
  | 'empty_response'
  | 'invalid_request'
  | 'rate_limited'
  | 'timeout'
  | 'model_unavailable'
  | 'auth'
  | 'upstream';

export class NvidiaError extends Error {
  readonly kind: NvidiaErrorKind;
  readonly status?: number;
  readonly model?: string;
  constructor(
    kind: NvidiaErrorKind,
    message: string,
    opts: { status?: number; model?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'NvidiaError';
    this.kind = kind;
    this.status = opts.status;
    this.model = opts.model;
    if (opts.cause !== undefined) {
      (this as { cause?: unknown }).cause = opts.cause;
    }
  }
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

export function createNvidiaClient(): OpenAI {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new NvidiaError(
      'missing_credentials',
      'NVIDIA_API_KEY environment variable is not set.',
    );
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /**
   * Set to `false` to skip the `chat_template_kwargs.skip_reasoning` flag.
   * Defaults to `true` so reasoning models (Nemotron / DeepSeek) emit the
   * final answer directly into `content` instead of prefacing it with a
   * chain-of-thought preamble.
   */
  skipReasoning?: boolean;
  /**
   * Force JSON-mode output. NVIDIA NIM honours OpenAI's
   * `response_format: { type: "json_object" }` and bypasses reasoning
   * entirely for supported models. Defaults to `false` to preserve free-form
   * text callers (chat / detect-clauses / etc.).
   */
  jsonMode?: boolean;
}

interface GenerateResult {
  text: string;
  model: string;
  finishReason: string | null;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Extract a usable text payload from a completion choice's message.
 *
 * - Prefers `message.content` when present and non-empty (standard chat path).
 * - Falls back to `message.reasoning_content` for reasoning models that put
 *   the final answer there (defensive; reasoning_content is normally the
 *   chain-of-thought). When we *can* tell the difference we still try
 *   content first because that's the documented contract.
 * - Concatenates `content` parts when the provider returns an array (vision
 *   / multi-part style).
 * - Returns an empty string when nothing usable is found.
 *
 * Exported for testability – the function is pure and stable.
 */
export function extractMessageText(choice: unknown): string {
  if (!choice || typeof choice !== 'object') return '';
  const message = (choice as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return '';

  const m = message as Record<string, unknown>;

  // 1. String content (most common path).
  if (typeof m.content === 'string' && m.content.trim().length > 0) {
    return m.content;
  }

  // 2. Array content (multi-part).
  if (Array.isArray(m.content)) {
    const joined = m.content
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const p = part as Record<string, unknown>;
        if (typeof p.text === 'string') return p.text;
        return '';
      })
      .filter((s) => s.length > 0)
      .join('\n');
    if (joined.trim().length > 0) return joined;
  }

  // 3. Reasoning content (Nemotron / DeepSeek style).
  if (
    typeof m.reasoning_content === 'string' &&
    m.reasoning_content.trim().length > 0
  ) {
    return m.reasoning_content;
  }

  return '';
}

/**
 * Classify an arbitrary error from the OpenAI client so callers can pick
 * sensible HTTP status codes / retry behaviour without leaking provider
 * internals to the browser.
 */
function classifyError(err: unknown): NvidiaError {
  if (err instanceof NvidiaError) return err;

  // OpenAI SDK errors carry a `status` and a `name` we can leverage.
  const anyErr = err as {
    name?: string;
    status?: number;
    message?: string;
    code?: string;
  };
  const status = typeof anyErr?.status === 'number' ? anyErr.status : undefined;
  const name = anyErr?.name || '';
  const message = anyErr?.message || 'NVIDIA request failed';

  if (name === 'AbortError' || /timeout|aborted/i.test(message)) {
    return new NvidiaError('timeout', message, { status, cause: err });
  }
  if (status === 401 || status === 403) {
    return new NvidiaError('auth', message, { status, cause: err });
  }
  if (status === 404 || status === 410) {
    return new NvidiaError('model_unavailable', message, { status, cause: err });
  }
  if (status === 429) {
    return new NvidiaError('rate_limited', message, { status, cause: err });
  }
  if (status === 400) {
    return new NvidiaError('invalid_request', message, { status, cause: err });
  }
  if (status !== undefined && status >= 500) {
    return new NvidiaError('upstream', message, { status, cause: err });
  }
  return new NvidiaError('upstream', message, { status, cause: err });
}

/**
 * Make a single chat completion call. Throws a typed NvidiaError on
 * failure. This is the low-level primitive used by safeGenerate and the
 * convenience helpers below.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: GenerateOptions = {},
): Promise<GenerateResult> {
  const model = options.model ?? NVIDIA_MODELS.primary;
  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 4096;
  const timeoutMs = options.timeoutMs ?? DEFAULT_NVIDIA_TIMEOUT_MS;
  const includeSkipReasoning = options.skipReasoning !== false;
  const jsonMode = options.jsonMode === true;

  const client = createNvidiaClient();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const linkedSignal = options.signal
    ? linkSignals(controller.signal, options.signal)
    : controller.signal;

  let completion: OpenAI.Chat.ChatCompletion;
  try {
    // The OpenAI SDK v6 doesn't know about NVIDIA's `chat_template_kwargs`
    // extension, so we cast the body to `any` to inject it. The flag is
    // ignored by non-reasoning models, so this is safe across the catalogue.
    const body: any = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };
    if (includeSkipReasoning) {
      body.chat_template_kwargs = { skip_reasoning: true };
    }
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    completion = await client.chat.completions.create(body, {
      signal: linkedSignal,
    });
  } catch (rawErr) {
    const err = classifyError(rawErr);
    if (err.kind === 'timeout' && options.signal?.aborted) {
      // Caller aborted – surface as abort, not upstream timeout.
      throw new NvidiaError(
        'timeout',
        'Caller aborted the request',
        { status: err.status, model, cause: rawErr },
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const choice = completion.choices?.[0];
  const text = extractMessageText(choice);
  const finishReason = (choice?.finish_reason as string | null) ?? null;

  if (!text) {
    throw new NvidiaError(
      'empty_response',
      `NVIDIA returned an empty response (model=${model}, finishReason=${finishReason ?? 'unknown'}).`,
      { model, status: 200 },
    );
  }

  const usage = completion.usage
    ? {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      }
    : undefined;

  return { text, model, finishReason, usage };
}

/** Combine two AbortSignals so either abort cancels the request. */
function linkSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (a.aborted) return a;
  if (b.aborted) return b;
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  return ctrl.signal;
}

/**
 * Generate text from a single user prompt. Returns the raw response string.
 */
export async function generateText(
  prompt: string,
  model: string = NVIDIA_MODELS.primary,
  temperature = 0.7,
  maxTokens = 4096,
  timeoutMs = DEFAULT_NVIDIA_TIMEOUT_MS,
  jsonMode = false,
): Promise<string> {
  const result = await chatCompletion(
    [{ role: 'user', content: prompt }],
    { model, temperature, maxTokens, timeoutMs, jsonMode },
  );
  return result.text;
}

/**
 * Generate text with a system prompt.
 */
export async function generateWithSystem(
  systemPrompt: string,
  userPrompt: string,
  model: string = NVIDIA_MODELS.primary,
  temperature = 0.7,
  maxTokens = 4096,
): Promise<string> {
  const result = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { model, temperature, maxTokens },
  );
  return result.text;
}

// ---------------------------------------------------------------------------
// JSON parsing helpers (re-export surface kept for existing callers).
// ---------------------------------------------------------------------------

/**
 * Attempt to repair a truncated JSON string by closing any unclosed
 * strings / arrays / objects. Returns the repaired string (best-effort).
 */
function repairTruncatedJson(text: string): string {
  let result = text.trimEnd();

  result = result.replace(/,\s*$/, '');

  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (const char of result) {
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\' && inString) {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') stack.pop();
    }
  }

  if (inString) result += '"';
  result = result.replace(/,(\s*)$/, '$1');
  while (stack.length > 0) {
    const open = stack.pop();
    result += open === '{' ? '}' : ']';
  }
  return result;
}

/**
 * Parse JSON from an AI response, stripping markdown code fences if present.
 * Falls back to:
 *   1. Best-effort JSON repair for truncated outputs.
 *   2. Prose extraction: find the first '{' and last '}' and try parsing that
 *      slice — handles models that prepend text like "Here's the analysis..."
 */
export function parseJsonResponse<T>(text: string): T {
  // 1. Strip markdown fences if present (closed or unclosed).
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/);
  const jsonText = (jsonMatch ? jsonMatch[1] : text).trim();

  // 2. Try plain parse.
  try {
    return JSON.parse(jsonText) as T;
  } catch { /* fall through */ }

  // 3. Try JSON repair (handles truncated outputs).
  try {
    return JSON.parse(repairTruncatedJson(jsonText)) as T;
  } catch { /* fall through */ }

  // 4. Extract embedded JSON object from prose (model prepended explanatory text).
  // Find the outermost { ... } block.
  const firstBrace = text.indexOf('{');
  if (firstBrace !== -1) {
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      const embedded = text.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(embedded) as T;
      } catch { /* fall through */ }
      // Also try repair on the embedded slice.
      try {
        return JSON.parse(repairTruncatedJson(embedded)) as T;
      } catch { /* fall through */ }
    }
  }

  throw new Error(
    `Failed to parse AI response as JSON: no valid JSON object found in response.`,
  );
}

// ---------------------------------------------------------------------------
// Higher-level: same API as generateText but with retries + model fallback.
// ---------------------------------------------------------------------------

export interface SafeGenerateOptions extends GenerateOptions {
  /** Max total attempts across all models (default 2). */
  maxAttempts?: number;
  /** If true (default) and primary fails, retry once with the fallback model. */
  useFallback?: boolean;
}

/**
 * Resilient wrapper around chatCompletion. Retries on transient errors
 * (timeout / upstream 5xx / rate limit / empty response) and falls back to
 * the configured fallback model before giving up. Auth errors, missing
 * credentials, and clear invalid-request errors are surfaced immediately –
 * retrying them wastes budget and hides bugs.
 */
export async function safeGenerate(
  messages: ChatMessage[],
  options: SafeGenerateOptions = {},
): Promise<GenerateResult> {
  const useFallback = options.useFallback !== false;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_RETRIES + 1);

  const modelsToTry: string[] = [];
  const primary = options.model ?? NVIDIA_MODELS.primary;
  modelsToTry.push(primary);
  if (useFallback && primary !== NVIDIA_MODELS.fallback) {
    modelsToTry.push(NVIDIA_MODELS.fallback);
  }

  let lastError: NvidiaError | null = null;

  for (const candidateModel of modelsToTry) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await chatCompletion(messages, {
          ...options,
          model: candidateModel,
        });
        return result;
      } catch (rawErr) {
        const err =
          rawErr instanceof NvidiaError
            ? rawErr
            : classifyError(rawErr);

        lastError =
          err instanceof NvidiaError ? err : new NvidiaError('upstream', String(rawErr), { cause: rawErr });

        // Hard, non-retryable failures – surface immediately.
        if (
          err.kind === 'auth' ||
          err.kind === 'missing_credentials' ||
          err.kind === 'invalid_request' ||
          err.kind === 'model_unavailable'
        ) {
          // For model_unavailable, try the next candidate if available; otherwise surface.
          if (err.kind === 'model_unavailable') {
            break;
          }
          throw err;
        }

        // Retryable, but we may have exhausted attempts on this model.
        if (attempt >= maxAttempts) break;
        // Quick exponential backoff (capped).
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** (attempt - 1), 4000)));
      }
    }
  }

  throw (
    lastError ??
    new NvidiaError('upstream', 'NVIDIA request failed for all configured models')
  );
}

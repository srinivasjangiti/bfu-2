// Streaming API route for analyzing contracts via Server-Sent Events

import { NextRequest } from 'next/server';
import { DocumentParser } from '@/lib/document-parser';
import { ContractAnalyzer } from '@/lib/contract-analyzer';
import { validateContractFile, sanitizeInput } from '@/lib/security';
import { createNvidiaClient, NVIDIA_MODELS, parseJsonResponse, NvidiaError, safeGenerate } from '@/lib/nvidia-client';
import { PrismaClient } from '@prisma/client';

import { prisma } from "@/lib/prisma";

/**
 * Map an arbitrary error coming out of the streaming chat call to a safe,
 * user-facing message. The full error is logged server-side, the browser
 * only ever sees a short sentence + a stable error code.
 */
function classifyStreamError(err: unknown): { message: string; code: string } {
  if (err instanceof NvidiaError) {
    switch (err.kind) {
      case 'missing_credentials':
        return { message: 'AI service is not configured on the server.', code: 'ai_unconfigured' };
      case 'auth':
        return { message: 'AI service credentials were rejected.', code: 'ai_unauthorized' };
      case 'invalid_request':
        return { message: 'The request was rejected by the AI provider.', code: 'ai_invalid_request' };
      case 'rate_limited':
        return { message: 'AI service is rate-limited; please retry shortly.', code: 'ai_rate_limited' };
      case 'timeout':
        return { message: 'AI service timed out; please retry.', code: 'ai_timeout' };
      case 'empty_response':
        return { message: 'AI returned an empty response; please retry.', code: 'ai_empty' };
      case 'model_unavailable':
        return {
          message:
            'The configured AI model is no longer available on the provider. Please update the model id or rotate NVIDIA_MODEL to a supported one.',
          code: 'ai_model_unavailable',
        };
      case 'upstream':
      default:
        return { message: 'AI provider is currently unavailable; please retry.', code: 'ai_upstream' };
    }
  }
  const status = (err as { status?: number })?.status;
  if (status === 404 || status === 410) {
    return {
      message:
        'The configured AI model is no longer available on the provider. Please update the model id or rotate NVIDIA_MODEL to a supported one.',
      code: 'ai_model_unavailable',
    };
  }
  return { message: 'Failed to analyze contract; please retry.', code: 'internal' };
}

/**
 * Validates the parsed AI JSON response against the expected domain schema.
 * Throws an error if the schema is malformed or missing critical fields.
 */
function validateAnalysisData(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Analysis data must be a valid JSON object');
  }

  const obj = data as Record<string, unknown>;
  const errors: string[] = [];

  if (obj.summary !== undefined && typeof obj.summary !== 'string') errors.push('summary must be a string');
  if (obj.riskScore !== undefined && typeof obj.riskScore !== 'number') errors.push('riskScore must be a number');

  if (obj.clauses !== undefined) {
    if (!Array.isArray(obj.clauses)) {
      errors.push('clauses must be an array');
    } else {
      obj.clauses.forEach((clause: any, index: number) => {
        if (!clause || typeof clause !== 'object') {
          errors.push(`clauses[${index}] must be an object`);
        } else {
          if (clause.id !== undefined && typeof clause.id !== 'string') errors.push(`clauses[${index}].id must be a string`);
          if (clause.title !== undefined && typeof clause.title !== 'string') errors.push(`clauses[${index}].title must be a string`);
          if (clause.riskLevel !== undefined && typeof clause.riskLevel !== 'string') errors.push(`clauses[${index}].riskLevel must be a string`);
        }
      });
    }
  }

  if (obj.redFlags !== undefined) {
    if (!Array.isArray(obj.redFlags)) {
      errors.push('redFlags must be an array');
    } else {
      obj.redFlags.forEach((flag: any, index: number) => {
        if (!flag || typeof flag !== 'object') {
          errors.push(`redFlags[${index}] must be an object`);
        } else {
          if (flag.id !== undefined && typeof flag.id !== 'string') errors.push(`redFlags[${index}].id must be a string`);
          if (flag.severity !== undefined && typeof flag.severity !== 'string') errors.push(`redFlags[${index}].severity must be a string`);
          if (flag.title !== undefined && typeof flag.title !== 'string') errors.push(`redFlags[${index}].title must be a string`);
        }
      });
    }
  }

  if (obj.recommendations !== undefined && !Array.isArray(obj.recommendations)) {
    errors.push('recommendations must be an array');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid AI response schema: ${errors.join(', ')}`);
  }

  return obj;
}

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may already be closed
        }
      };

      try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const jurisdiction = sanitizeInput((formData.get('jurisdiction') as string) || 'US');

        if (!file) {
          send({ type: 'error', error: 'No file provided', requestId });
          controller.close();
          return;
        }

        const validation = validateContractFile(file);
        if (!validation.valid) {
          send({ type: 'error', error: (validation.errors || []).join(', ') || 'File validation failed', requestId });
          controller.close();
          return;
        }

        if (!DocumentParser.validateFileType(file)) {
          send({ type: 'error', error: 'Invalid file type. Please upload PDF, DOCX, or TXT files.', requestId });
          controller.close();
          return;
        }

        const maxSize = parseInt(process.env.NEXT_PUBLIC_MAX_FILE_SIZE || '10485760');
        if (!DocumentParser.validateFileSize(file, maxSize)) {
          send({ type: 'error', error: `File size exceeds the maximum allowed size of ${maxSize / 1024 / 1024}MB`, requestId });
          controller.close();
          return;
        }

        // Step 1: Parse document
        send({ type: 'status', message: 'Parsing document...' });
        const contractText = await DocumentParser.parse(file);

        if (!contractText || contractText.trim().length < 100) {
          send({ type: 'error', error: 'Contract text is too short or could not be extracted', requestId });
          controller.close();
          return;
        }

        // Step 2: Build prompt
        send({ type: 'status', message: 'Connecting to AI...' });
        const maxPromptChars = parseInt(process.env.ANALYZE_MAX_PROMPT_CHARS || '100000');
        const maxTokens = parseInt(process.env.ANALYZE_MAX_OUTPUT_TOKENS || '4096');
        const trimmedText = contractText.length > maxPromptChars
          ? contractText.slice(0, maxPromptChars) + '\n\n[Contract text truncated for faster analysis]'
          : contractText;
        const prompt = ContractAnalyzer.buildAnalysisPrompt(trimmedText, jurisdiction);

        // Step 3: Call NVIDIA NIM (non-streaming via safeGenerate)
        // safeGenerate already handles skip_reasoning, reasoning_content
        // extraction, retries with exponential backoff, and model fallback.
        // We still send SSE progress events for UX and deliver the full
        // parsed analysis in one piece at the end.
        send({ type: 'status', message: 'AI is analyzing your contract...' });
        const result = await safeGenerate(
          [{ role: 'user', content: prompt }],
          {
            model: NVIDIA_MODELS.fast,
            temperature: 0.3,
            maxTokens,
            jsonMode: true,
            maxAttempts: 3,
          },
        );
        const fullText = result.text;

        // Step 4: Parse full JSON and send structured analysis
        send({ type: 'status', message: 'Finalizing analysis...' });
        const rawAnalysisData = parseJsonResponse<unknown>(fullText);
        const analysisData = validateAnalysisData(rawAnalysisData);
        const analysis = ContractAnalyzer.formatAnalysis(analysisData, file.name, file.size);

        // MVP Dashboard Persistence
        try {
          await prisma.analyzedContract.create({
            data: {
              fileName: file.name,
              contractType: (analysisData.contractType as string) || 'Unknown',
              riskScore: analysis.riskScore || 0,
              summary: JSON.stringify(analysis), // Store full snapshot for history
              redFlagsCount: analysis.redFlags?.length || 0,
              clausesCount: analysis.clauses?.length || 0,
            }
          });
        } catch (e) {
          console.error("Dashboard persistence failed", e);
        }

        send({ type: 'done', analysis, requestId });
        controller.close();

      } catch (error) {
        const classified = classifyStreamError(error);
        // Log the full error server-side (stack + status + message) and a
        // safe classification in the SSE so the user sees something
        // actionable. Never expose raw provider internals.
        if (error instanceof NvidiaError) {
          console.error('[analyze] AI error', {
            kind: error.kind,
            model: error.model,
            status: error.status,
            message: error.message,
            requestId,
          });
        } else {
          console.error('[analyze] unexpected error', { error, requestId });
        }
        send({ type: 'error', error: classified.message, code: classified.code, requestId });
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Request-Id': requestId,
    },
  });
}

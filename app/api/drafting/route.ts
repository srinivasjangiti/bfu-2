import { NextRequest, NextResponse } from 'next/server';
import {
  AIContractDrafter,
  ContractDraftRequest,
  NvidiaError,
} from '@/lib/ai-contract-drafter';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
// Match the ceiling set in vercel.json. Anything longer than this is rejected
// by the platform before our handler ever gets to log it.
export const maxDuration = 60;

/**
 * Validate the incoming /api/drafting body.
 *
 * Returns a normalised request, or a string describing the first validation
 * failure (which the caller turns into a 400 response). We deliberately do
 * not throw so the route can keep its error envelope uniform.
 */
type Action = 'draft' | 'refine' | 'variations' | 'recommendations';

function validateBody(
  body: unknown,
):
  | { ok: true; action: Action; data: Record<string, unknown> }
  | { ok: false; status: number; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid JSON body.' };
  }
  const { action, ...rest } = body as Record<string, unknown>;
  if (typeof action !== 'string') {
    return { ok: false, status: 400, error: 'Missing "action".' };
  }
  if (!['draft', 'refine', 'variations', 'recommendations'].includes(action)) {
    return { ok: false, status: 400, error: `Unsupported action "${action}".` };
  }
  return { ok: true, action: action as Action, data: rest };
}

/**
 * Translate an upstream / drafter error into a safe client-facing message.
 * The real error / stack trace is preserved on the server console for
 * diagnosis, but is NEVER shipped to the browser.
 */
function redact(err: unknown): { status: number; error: string; code: string } {
  if (err instanceof NvidiaError) {
    switch (err.kind) {
      case 'missing_credentials':
        return { status: 503, code: 'ai_unconfigured', error: 'AI service is not configured on the server.' };
      case 'auth':
        return { status: 503, code: 'ai_unauthorized', error: 'AI service credentials were rejected.' };
      case 'invalid_request':
        return { status: 400, code: 'ai_invalid_request', error: 'The request was rejected by the AI provider.' };
      case 'rate_limited':
        return { status: 503, code: 'ai_rate_limited', error: 'AI service is rate-limited; please retry shortly.' };
      case 'timeout':
        return { status: 504, code: 'ai_timeout', error: 'AI service timed out; please retry.' };
      case 'empty_response':
        return { status: 502, code: 'ai_empty', error: 'AI returned an empty response; please retry.' };
      case 'model_unavailable':
        return { status: 502, code: 'ai_model_unavailable', error: 'Configured AI model is unavailable; please retry.' };
      default:
        return { status: 502, code: 'ai_upstream', error: 'AI provider is currently unavailable.' };
    }
  }
  return { status: 500, code: 'internal', error: 'Failed to process request.' };
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const validated = validateBody(rawBody);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }

  const { action, data } = validated;
  const drafter = new AIContractDrafter();

  try {
    switch (action) {
      case 'draft': {
        const request = data as unknown as ContractDraftRequest;
        const partyCheck = validateDraftRequest(request);
        if (partyCheck) {
          return NextResponse.json({ error: partyCheck }, { status: 400 });
        }

        const result = await drafter.draftContract(request);

        // Persistence is best-effort: a DB outage must NOT turn a successful
        // generation into a user-visible failure. The user gets their
        // contract back either way; we just lose the audit row.
        try {
          await prisma.analyzedContract.create({
            data: {
              fileName: `${request.contractType} (Draft)`,
              contractType: 'Draft',
              riskScore: 0,
              summary: JSON.stringify(result),
              redFlagsCount: 0,
              clausesCount: result.sections?.length || 0,
            },
          });
        } catch (persistErr) {
          if (isPrismaError(persistErr)) {
            console.error(
              '[drafting] persistence failed (will continue without DB save):',
              persistErr.code || persistErr.message,
            );
          } else {
            console.error('[drafting] persistence failed:', persistErr);
          }
        }

        return NextResponse.json(result);
      }

      case 'refine': {
        const { currentDraft, refinements } = data as {
          currentDraft?: unknown;
          refinements?: unknown;
        };
        if (!currentDraft || !Array.isArray(refinements)) {
          return NextResponse.json(
            { error: 'refine requires currentDraft and refinements[]' },
            { status: 400 },
          );
        }
        const result = await drafter.refineDraft(
          currentDraft as Parameters<AIContractDrafter['refineDraft']>[0],
          refinements as Parameters<AIContractDrafter['refineDraft']>[1],
        );
        return NextResponse.json(result);
      }

      case 'variations': {
        // The route historically accepted either a draftId or a full request
        // object. We require a usable ContractDraftRequest here so callers
        // cannot silently no-op. A null/empty body now becomes a 400 instead
        // of a cryptic 500.
        if (
          !data.contractType ||
          !data.parties ||
          typeof data.parties !== 'object'
        ) {
          return NextResponse.json(
            { error: 'variations requires contractType + parties' },
            { status: 400 },
          );
        }
        const result = await drafter.generateVariations(
          data as unknown as ContractDraftRequest,
        );
        return NextResponse.json(result);
      }

      case 'recommendations': {
        const { contractType, industry, parties, existingSections } = data as {
          contractType?: unknown;
          industry?: unknown;
          parties?: unknown;
          existingSections?: unknown;
        };
        if (
          typeof contractType !== 'string' ||
          typeof industry !== 'string' ||
          !Array.isArray(existingSections)
        ) {
          return NextResponse.json(
            { error: 'recommendations requires contractType, industry and existingSections[]' },
            { status: 400 },
          );
        }
        const result = await drafter.recommendClauses(
          contractType,
          industry,
          parties,
          existingSections,
        );
        return NextResponse.json(result);
      }

      default:
        // Unreachable given validateBody, but keeps TS exhaustiveness.
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (err) {
    // Log the FULL error server-side (stack + message) and a stable code in
    // the response so the user sees an actionable message but operators can
    // still diagnose the issue from logs.
    const redacted = redact(err);
    if (err instanceof NvidiaError) {
      console.error('[drafting] AI error', {
        kind: err.kind,
        model: err.model,
        status: err.status,
        message: err.message,
      });
    } else if (isPrismaError(err)) {
      console.error('[drafting] Prisma error', {
        code: err.code,
        message: err.message,
      });
    } else {
      console.error('[drafting] unexpected error', err);
    }
    return NextResponse.json(
      { error: redacted.error, code: redacted.code },
      { status: redacted.status },
    );
  }
}

function isPrismaError(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code?: unknown }).code === 'string'
  );
}

function validateDraftRequest(req: ContractDraftRequest): string | null {
  if (!req || typeof req !== 'object') return 'Missing request body.';
  if (!req.contractType || typeof req.contractType !== 'string') {
    return 'contractType is required.';
  }
  if (!req.parties || typeof req.parties !== 'object') {
    return 'parties is required.';
  }
  const { party1, party2 } = req.parties;
  if (!party1?.name || !party2?.name) {
    return 'parties.party1.name and parties.party2.name are required.';
  }
  if (!req.requirements || typeof req.requirements !== 'string') {
    return 'requirements (natural-language description) is required.';
  }
  return null;
}

/**
 * Shared helpers for PDF tool routes.
 *
 * Centralises FormData parsing, error envelope, and a few common
 * conversions (File -> Uint8Array, buffer -> Response with proper
 * Content-Type / Content-Disposition) so each route can stay small.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

export interface ExtractedPdfPage {
  num: number;
  text: string;
  lines: string[];
}

export interface ExtractedPdf {
  text: string;
  pageCount: number;
  pages: ExtractedPdfPage[];
}

/**
 * Extract text and line structure from a PDF using pdfjs-dist.
 * Pure-JS, works in Node / Next.js / Vercel without external binaries.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<ExtractedPdf> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const pages: ExtractedPdfPage[] = [];
  const fullTextParts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();

    let lastY: number | null = null;
    const lines: string[] = [];
    let currentLine = '';

    for (const item of tc.items as Array<{ str?: string; transform?: number[] }>) {
      if (!item || typeof item.str !== 'string') continue;
      const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = item.str;
      } else {
        currentLine += (currentLine ? ' ' : '') + item.str;
      }
      lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    const pageText = lines.join('\n');
    pages.push({ num: i, text: pageText, lines });
    fullTextParts.push(pageText);
  }

  return {
    text: fullTextParts.join('\n\n\f\n\n'),
    pageCount: doc.numPages,
    pages,
  };
}

export class RouteError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.name = 'RouteError';
    this.status = status;
    this.code = code;
  }
}

/** Wrap an async handler so any thrown error becomes a JSON envelope. */
export function withErrorHandler(
  handler: (req: NextRequest) => Promise<NextResponse | Response>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const out = await handler(req);
      if (out instanceof NextResponse) return out;
      // Convert a plain Response into a NextResponse preserving headers
      // and status. We lose response.cookies (a Next-only field) but
      // that doesn't matter for binary file downloads.
      const headers = new Headers(out.headers);
      const ct = headers.get('content-type');
      const ab = await out.arrayBuffer();
      return new NextResponse(new Uint8Array(ab), {
        status: out.status,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': ct ?? 'application/octet-stream' },
      });
    } catch (err) {
      if (err instanceof RouteError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.status },
        );
      }
      const message =
        err instanceof Error ? err.message : 'Unexpected server error';
      console.error('[pdf-route] unexpected error:', err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

/** Pull a single File from FormData or throw 400. */
export function requiredFile(formData: FormData, name = 'file'): File {
  const f = formData.get(name);
  if (!(f instanceof File)) {
    throw new RouteError(`Missing "${name}" file.`, 400, 'missing_file');
  }
  return f;
}

/** Pull a string field from FormData; throws 400 if missing. */
export function requiredString(formData: FormData, name: string): string {
  const v = formData.get(name);
  if (typeof v !== 'string' || v.length === 0) {
    throw new RouteError(`Missing "${name}".`, 400, `missing_${name}`);
  }
  return v;
}

/** Convert a File to a Uint8Array suitable for pdf-lib. */
export async function fileToBytes(file: File): Promise<Uint8Array> {
  const ab = await file.arrayBuffer();
  return new Uint8Array(ab);
}

/** Build a download Response from a buffer with sensible defaults. */
export function downloadResponse(
  buffer: Uint8Array,
  filename: string,
  contentType: string,
): NextResponse {
  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.byteLength),
    },
  });
}

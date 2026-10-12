/**
 * Extract text from a PDF.
 *
 * pdf-parse reads PDF text objects and reorders them by reading order.
 * We hand the user a .txt file. The pure-JS pipeline means this works
 * in Vercel's serverless runtime without binaries.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  withErrorHandler,
  requiredFile,
  RouteError,
  fileToBytes,
  extractPdfText,
} from '../_shared/pdf-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const layout = ((formData.get('layout') as string) || 'plain').toLowerCase();
  const bytes = await fileToBytes(file);

  let parsed;
  try {
    parsed = await extractPdfText(bytes);
  } catch (e) {
    console.error('[extract-text] pdfjs extraction failure', e);
    throw new RouteError(
      `PDF is invalid or corrupted: ${(e as Error)?.message ?? 'unknown'}`,
      415,
      'corrupt_pdf',
    );
  }

  if (!parsed.text || parsed.text.trim().length === 0) {
    // Honest: nothing extractable, not a fake success.
    throw new RouteError(
      'No extractable text was found. The PDF likely consists of scanned images and needs OCR.',
      422,
      'no_text',
    );
  }

  const out =
    layout === 'per-page'
      ? parsed.text
      : parsed.text.replace(/\f/g, '\n\n---\n\n');

  const buf = new TextEncoder().encode(out);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="extracted-${Date.now()}.txt"`,
      'Content-Length': String(buf.byteLength),
      'X-Page-Count': String(parsed.pageCount ?? parsed.pages.length ?? 0),
    },
  });
});

/**
 * OCR PDF — Optical Character Recognition for scanned / image PDFs.
 *
 * Renders PDF pages to high-resolution images via @napi-rs/canvas and
 * runs Tesseract.js OCR to extract text from scanned pages.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker } from 'tesseract.js';
import {
  withErrorHandler,
  requiredFile,
  RouteError,
  fileToBytes,
} from '../_shared/pdf-pipeline';

const pdfjsLib: any = pdfjs;

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_PAGES_TO_OCR = 10;
const SCALE = 2.0; // 150-200 DPI equivalent for good OCR accuracy

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const language = (formData.get('language') as string) || 'eng';

  const bytes = await fileToBytes(file);

  let pdf: any;
  try {
    pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      standardFontDataUrl: './node_modules/pdfjs-dist/standard_fonts/',
    }).promise;
  } catch (err) {
    throw new RouteError('PDF is invalid or corrupted.', 415, 'corrupt_pdf');
  }

  const pageCount = pdf.numPages;
  if (pageCount === 0) {
    throw new RouteError('PDF contains no pages.', 422, 'empty_pdf');
  }

  const pagesToProcess = Math.min(pageCount, MAX_PAGES_TO_OCR);

  // Initialize Tesseract worker
  let worker: any = null;
  try {
    worker = await createWorker(language);
  } catch (err) {
    console.error('[ocr] Failed to initialize Tesseract worker:', err);
    throw new RouteError('Failed to initialize OCR engine: ' + ((err as Error)?.message || 'unknown error'), 500, 'ocr_init_failed');
  }

  const results: string[] = [];

  try {
    for (let i = 1; i <= pagesToProcess; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: SCALE });

      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, viewport.width, viewport.height);

      await page.render({
        canvasContext: ctx as any,
        viewport,
        canvas: canvas as any,
      }).promise;

      const imgBuffer = canvas.toBuffer('image/png');
      const ocrResult = await worker.recognize(imgBuffer);
      const pageText = (ocrResult.data?.text || '').trim();

      results.push(`--- Page ${i} ---\n${pageText || '(No text detected on this page)'}`);
    }
  } catch (err) {
    console.error('[ocr] Processing error during recognition:', err);
    throw new RouteError('OCR processing failed: ' + ((err as Error)?.message || 'unknown error'), 500, 'ocr_failed');
  } finally {
    if (worker) {
      await worker.terminate().catch(() => undefined);
    }
  }

  const combinedText = results.join('\n\n');
  const textBuffer = new TextEncoder().encode(combinedText);

  return new NextResponse(new Uint8Array(textBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="ocr-${Date.now()}.txt"`,
      'Content-Length': String(textBuffer.byteLength),
      'X-Page-Count': String(pageCount),
      'X-Pages-Processed': String(pagesToProcess),
      'X-OCR-Engine': 'Tesseract.js',
    },
  });
});

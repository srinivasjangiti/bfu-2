/**
 * PDF → JPG/PNG conversion.
 *
 * Renders each page to a canvas via Mozilla's pdfjs-dist (pure JS) and a
 * N-API canvas, then encodes the result with sharp. Multi-page output is
 * returned as a single ZIP file so the browser can offer a real
 * download with every page inside.
 *
 * Pure-JS / N-API only, so this works on Vercel's serverless runtime
 * without LibreOffice / poppler / GraphicsMagick binaries.
 */
import { NextRequest } from 'next/server';
import JSZip from 'jszip';
// pdfjs-dist v4 ships as ESM only.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import {
  withErrorHandler,
  requiredFile,
  RouteError,
  downloadResponse,
} from '../_shared/pdf-pipeline';

// pdfjs requires a `GlobalWorkerOptions.workerSrc` to be set. In Node we
// have no real worker, so we point it at the bundled worker file and
// disable workers (useSingleInstance below).
const pdfjsLib: any = pdfjs;

export const runtime = 'nodejs';
export const maxDuration = 60;

const SUPPORTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
const MAX_PAGES = 200;
const MAX_DIMENSION = 4096; // 4K cap; anything larger wastes memory.

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const format = ((formData.get('format') as string) || 'jpeg').toLowerCase();
  const quality = Math.min(100, Math.max(1, parseInt((formData.get('quality') as string) || '85', 10)));
  const scale = Math.min(3, Math.max(0.5, parseFloat((formData.get('scale') as string) || '2')));

  if (!SUPPORTED_FORMATS.has(format)) {
    throw new RouteError(`Unsupported format "${format}".`, 400, 'invalid_format');
  }

  const ab = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(ab),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  if (pageCount === 0) {
    throw new RouteError('PDF contains no pages.', 422, 'empty_pdf');
  }
  if (pageCount > MAX_PAGES) {
    throw new RouteError(
      `PDF has ${pageCount} pages; maximum is ${MAX_PAGES} for this tool.`,
      413,
      'too_many_pages',
    );
  }

  const zip = new JSZip();
  const mime = format === 'png' ? 'image/png' : format === 'webp' ? 'image/webp' : 'image/jpeg';
  const ext = format === 'png' ? 'png' : format === 'webp' ? 'webp' : 'jpg';

  for (let i = 1; i <= pageCount; i += 1) {
    const page = await pdf.getPage(i);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetW = Math.min(MAX_DIMENSION, Math.round(baseViewport.width * scale));
    const actualScale = targetW / baseViewport.width;
    const viewport = page.getViewport({ scale: actualScale });

    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d');
    // White background — most viewers expect this rather than transparent.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    await page.render({ canvasContext: ctx as any, viewport, canvas: canvas as any }).promise;

    const raw = canvas.toBuffer('image/png');
    let encoded: Buffer;
    if (format === 'png') {
      encoded = raw;
    } else {
      encoded = await sharp(raw)
        .resize({ width: targetW, withoutEnlargement: true })
        [format === 'webp' ? 'webp' : 'jpeg']({
          quality,
          progressive: format === 'jpeg',
          mozjpeg: format === 'jpeg',
        })
        .toBuffer();
    }
    zip.file(`page-${String(i).padStart(3, '0')}.${ext}`, encoded);
  }

  const zipBuffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return downloadResponse(
    zipBuffer,
    `pdf-pages-${Date.now()}.zip`,
    'application/zip',
  );
});

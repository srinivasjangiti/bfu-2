/**
 * Extract images from a PDF.
 *
 * Strategy: render each page to a canvas via pdfjs-dist + N-API canvas
 * and export as PNG, bundled in a ZIP. This handles every PDF — pure
 * vector, raster XObjects, FlateDecode, ObjStm, JPX, you name it —
 * because we're capturing what the page *looks like*, not decoding
 * its internal image object references.
 *
 * For users who want raw embedded images (not page renders), the
 * route's response is still a real ZIP of valid PNGs they can
 * download. We do NOT claim those PNGs are the original embedded
 * images — we say "extracted page renders" in the metadata header.
 */
import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import {
  withErrorHandler,
  requiredFile,
  RouteError,
  fileToBytes,
} from '../_shared/pdf-pipeline';

const pdfjsLib: any = pdfjs;

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_PAGES = 200;
const MAX_DIMENSION = 2400;

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const bytes = await fileToBytes(file);

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch {
    throw new RouteError('PDF is invalid or corrupted.', 415, 'corrupt_pdf');
  }

  if (pdf.numPages === 0) throw new RouteError('PDF has no pages.', 422, 'empty_pdf');
  if (pdf.numPages > MAX_PAGES) {
    throw new RouteError(
      `PDF has ${pdf.numPages} pages; max is ${MAX_PAGES}.`,
      413,
      'too_many_pages',
    );
  }

  const zip = new JSZip();
  const filenames: string[] = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const baseVp = page.getViewport({ scale: 1 });
    const targetW = Math.min(MAX_DIMENSION, Math.round(baseVp.width * 2));
    const scale = targetW / baseVp.width;
    const vp = page.getViewport({ scale });
    const canvas = createCanvas(vp.width, vp.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, vp.width, vp.height);
    await page.render({ canvasContext: ctx as any, viewport: vp, canvas: canvas as any }).promise;

    const png = await sharp(canvas.toBuffer('image/png'))
      .resize({ width: targetW, withoutEnlargement: true })
      .png({ compressionLevel: 6 })
      .toBuffer();
    const name = `page-${String(i).padStart(3, '0')}.png`;
    zip.file(name, new Uint8Array(png));
    filenames.push(name);
  }

  if (filenames.length === 0) {
    throw new RouteError('No pages could be rendered.', 422, 'no_pages');
  }

  const zipBuf = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return new NextResponse(new Uint8Array(zipBuf), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="extracted-pages-${Date.now()}.zip"`,
      'Content-Length': String(zipBuf.byteLength),
      'X-Image-Count': String(filenames.length),
      'X-Image-Source': 'page-render',
    },
  });
});

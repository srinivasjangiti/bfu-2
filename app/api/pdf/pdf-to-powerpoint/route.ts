/**
 * PDF → PPTX.
 *
 * Each PDF page becomes a slide with the page rendered as an image
 * (via pdfjs-dist + @napi-rs/canvas), so the original visual layout
 * is preserved inside the slide. Text overlays are not added; the
 * slide IS the image. This is the only honest way to get a real,
 * openable .pptx in pure JS on a serverless runtime.
 */
import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';
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
export const maxDuration = 120;
const MAX_PAGES = 100;
const MAX_DIMENSION = 1920;

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const bytes = await fileToBytes(file);

  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const pageCount = pdf.numPages;
  if (pageCount === 0) throw new RouteError('PDF has no pages.', 422, 'empty_pdf');
  if (pageCount > MAX_PAGES) {
    throw new RouteError(`PDF has ${pageCount} pages; max is ${MAX_PAGES}.`, 413, 'too_many_pages');
  }

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = 'Converted from PDF';
  pptx.company = 'BeforeYouSign';

  for (let i = 1; i <= pageCount; i += 1) {
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
    const dataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

    const slide = pptx.addSlide();
    slide.background = { color: 'FFFFFF' };
    const slideW = 10;
    const slideH = 5.625;
    const aspect = vp.width / vp.height;
    let w = slideW, h = slideW / aspect;
    if (h > slideH) { h = slideH; w = slideH * aspect; }
    const x = (slideW - w) / 2;
    const y = (slideH - h) / 2;
    slide.addImage({ data: dataUrl, x, y, w, h });
    slide.addNotes(`Imported from PDF page ${i} via BeforeYouSign.`);
  }

  const buf = await pptx.write({ outputType: 'arraybuffer' });
  return new NextResponse(new Uint8Array(buf as ArrayBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="converted-${Date.now()}.pptx"`,
      'Content-Length': String((buf as ArrayBuffer).byteLength),
    },
  });
});

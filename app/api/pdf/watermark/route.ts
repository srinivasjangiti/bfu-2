/**
 * PDF Watermark — overlays a configurable text watermark on every page
 * (or a subset) using pdf-lib. Pure JS.
 */
import { NextRequest } from 'next/server';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import {
  withErrorHandler,
  requiredFile,
  RouteError,
  fileToBytes,
  downloadResponse,
} from '../_shared/pdf-pipeline';
import { parsePageRanges } from '../../../../lib/pdf-engine/utils/pageRanges';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const text = ((formData.get('text') as string) || '').trim();
  if (!text) throw new RouteError('Watermark text is required.', 400, 'missing_text');
  if (text.length > 200) throw new RouteError('Watermark text is too long (max 200 chars).', 400, 'text_too_long');

  const fontSize = parseFloat((formData.get('fontSize') as string) || '48');
  const opacity = Math.min(1, Math.max(0.05, parseFloat((formData.get('opacity') as string) || '0.15')));
  const rotation = Math.min(360, Math.max(-360, parseFloat((formData.get('rotation') as string) || '-30')));
  const colorHex = ((formData.get('color') as string) || '#888888').replace('#', '');
  const pagesSpec = (formData.get('pages') as string) || 'all';

  if (!/^[0-9a-fA-F]{6}$/.test(colorHex)) {
    throw new RouteError('color must be a 6-digit hex code.', 400, 'invalid_color');
  }
  if (!Number.isFinite(fontSize) || fontSize <= 0 || fontSize > 500) {
    throw new RouteError('fontSize must be between 0 and 500.', 400, 'invalid_fontSize');
  }

  const bytes = await fileToBytes(file);
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  if (pages.length === 0) throw new RouteError('PDF contains no pages.', 422, 'empty_pdf');

  const selected = pagesSpec === 'all' || pagesSpec.trim() === ''
    ? pages.map((_, i) => i + 1)
    : parsePageRanges(pagesSpec, pages.length);

  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(
    parseInt(colorHex.slice(0, 2), 16) / 255,
    parseInt(colorHex.slice(2, 4), 16) / 255,
    parseInt(colorHex.slice(4, 6), 16) / 255,
  );

  for (const pageIdx of selected) {
    const page = pages[pageIdx - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(rotation),
    });
  }

  const out = await pdf.save();
  return downloadResponse(out, `watermarked-${Date.now()}.pdf`, 'application/pdf');
});

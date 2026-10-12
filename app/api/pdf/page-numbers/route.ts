/**
 * PDF Page Numbers — overlays a configurable page number on every page
 * (or a user-specified subset) using pdf-lib. Pure JS, no binaries.
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

const POSITIONS: Record<string, { dx: number; dy: number; align: 'left' | 'center' | 'right' }> = {
  'bottom-center': { dx: 0.5, dy: 0.05, align: 'center' },
  'bottom-right':  { dx: 0.95, dy: 0.05, align: 'right' },
  'bottom-left':   { dx: 0.05, dy: 0.05, align: 'left' },
  'top-center':    { dx: 0.5, dy  : 0.95, align: 'center' },
  'top-right':     { dx: 0.95, dy: 0.95, align: 'right' },
  'top-left':      { dx: 0.05, dy: 0.95, align: 'left' },
};

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const position = ((formData.get('position') as string) || 'bottom-center').toLowerCase();
  const fontSize = parseFloat((formData.get('fontSize') as string) || '10');
  const startFrom = parseInt((formData.get('startFrom') as string) || '1', 10);
  const totalStr = (formData.get('totalLabel') as string) || '';
  const showTotal = formData.get('showTotal') === 'true';
  const includeTotal = showTotal && totalStr.length > 0;
  const pagesSpec = (formData.get('pages') as string) || 'all';
  const colorHex = ((formData.get('color') as string) || '#333333').replace('#', '');
  const format = (formData.get('format') as string) || 'Page {n} of {total}';
  const margin = parseFloat((formData.get('margin') as string) || '0.4');

  if (!POSITIONS[position]) {
    throw new RouteError(`Unknown position "${position}".`, 400, 'invalid_position');
  }
  if (!Number.isFinite(fontSize) || fontSize <= 0 || fontSize > 72) {
    throw new RouteError('fontSize must be between 0 and 72.', 400, 'invalid_fontSize');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(colorHex)) {
    throw new RouteError('color must be a 6-digit hex code.', 400, 'invalid_color');
  }

  const bytes = await fileToBytes(file);
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();
  if (pages.length === 0) throw new RouteError('PDF contains no pages.', 422, 'empty_pdf');

  const selected = pagesSpec === 'all' || pagesSpec.trim() === ''
    ? pages.map((_, i) => i + 1)
    : parsePageRanges(pagesSpec, pages.length);
  if (selected.length === 0) {
    throw new RouteError('No pages matched the requested range.', 400, 'no_pages');
  }

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const color = rgb(
    parseInt(colorHex.slice(0, 2), 16) / 255,
    parseInt(colorHex.slice(2, 4), 16) / 255,
    parseInt(colorHex.slice(4, 6), 16) / 255,
  );

  const total = pages.length;
  let counter = startFrom;
  for (const pageIdx of selected) {
    const page = pages[pageIdx - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const pos = POSITIONS[position];
    const text = format
      .replace('{n}', String(counter))
      .replace('{total}', includeTotal ? String(total) : '');
    const textWidth = font.widthOfTextAtSize(text, fontSize);
    const x = pos.align === 'left'
      ? width * pos.dx
      : pos.align === 'right'
        ? width * pos.dx - textWidth
        : (width - textWidth) / 2;
    const y = height * pos.dy - (position.startsWith('top') ? 0 : fontSize);
    page.drawText(text, {
      x, y, size: fontSize, font, color, opacity: 0.9, rotate: degrees(0),
    });
    counter += 1;
  }

  const out = await pdf.save();
  return downloadResponse(out, `numbered-${Date.now()}.pdf`, 'application/pdf');
});

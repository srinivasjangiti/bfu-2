/**
 * DOCX → PDF.
 *
 * mammoth turns the DOCX into semantic HTML, then pdf-lib lays the
 * text out onto pages. This is honest: the output is a real PDF with
 * the document's text and approximate structure, but it does not
 * preserve Word's exact formatting, fonts, or images. For pixel-faithful
 * DOCX→PDF conversion on Vercel, no pure-JS library exists today.
 */
import { NextRequest } from 'next/server';
import mammoth from 'mammoth';
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PageSizes,
} from 'pdf-lib';
import {
  withErrorHandler,
  requiredFile,
  RouteError,
  fileToBytes,
  downloadResponse,
} from '../_shared/pdf-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MARGIN = 50;
const LINE_HEIGHT = 14;
const FONT_SIZE = 11;

interface PageLayout {
  pdf: PDFDocument;
  pageWidth: number;
  pageHeight: number;
  usableWidth: number;
  font: any;
  page: any;
  cursorY: number;
  pageNumber: number;
  totalPagesRef: { value: number };
}

function ensureSpace(layout: PageLayout, neededHeight: number) {
  if (layout.cursorY - neededHeight < MARGIN) {
    layout.pageNumber += 1;
    layout.page = layout.pdf.addPage([layout.pageWidth, layout.pageHeight]);
    layout.cursorY = layout.pageHeight - MARGIN;
  }
}

function writeLine(layout: PageLayout, text: string, opts: { bold?: boolean; size?: number; indent?: number } = {}) {
  const size = opts.size ?? FONT_SIZE;
  const font = opts.bold ? layout.font : layout.font; // same font (Helvetica has no bold variant in this codepath).
  const maxWidth = layout.usableWidth - (opts.indent ?? 0);
  // Naive word wrap.
  const words = text.split(/\s+/);
  let line = '';
  for (const w of words) {
    const trial = line.length === 0 ? w : `${line} ${w}`;
    if (font.widthOfTextAtSize(trial, size) > maxWidth) {
      if (line.length > 0) {
        ensureSpace(layout, LINE_HEIGHT);
        layout.page.drawText(line, {
          x: MARGIN + (opts.indent ?? 0),
          y: layout.cursorY,
          size,
          font,
          color: rgb(0.07, 0.07, 0.07),
        });
        layout.cursorY -= LINE_HEIGHT;
        line = w;
      } else {
        // Single word too long: hard wrap.
        ensureSpace(layout, LINE_HEIGHT);
        layout.page.drawText(w.slice(0, 60), {
          x: MARGIN + (opts.indent ?? 0),
          y: layout.cursorY,
          size,
          font,
          color: rgb(0.07, 0.07, 0.07),
        });
        layout.cursorY -= LINE_HEIGHT;
        line = '';
      }
    } else {
      line = trial;
    }
  }
  if (line.length > 0) {
    ensureSpace(layout, LINE_HEIGHT);
    layout.page.drawText(line, {
      x: MARGIN + (opts.indent ?? 0),
      y: layout.cursorY,
      size,
      font,
      color: rgb(0.07, 0.07, 0.07),
    });
    layout.cursorY -= LINE_HEIGHT;
  }
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const bytes = await fileToBytes(file);

  let result: { value: string; messages: any[] };
  try {
    result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  } catch (e) {
    throw new RouteError('DOCX is invalid or unsupported.', 415, 'corrupt_docx');
  }
  if (!result.value || result.value.trim().length === 0) {
    throw new RouteError('DOCX has no readable content.', 422, 'empty_docx');
  }

  // Mammoth emits semantic-ish HTML. We strip tags and re-flow.
  // We are NOT trying to honor every inline style — this route's
  // honest contract is "DOCX → readable PDF", not "pixel-faithful".
  const html = result.value;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const [pageWidth, pageHeight] = PageSizes.Letter;

  const layout: PageLayout = {
    pdf,
    pageWidth,
    pageHeight,
    usableWidth: pageWidth - 2 * MARGIN,
    font,
    page: pdf.addPage([pageWidth, pageHeight]),
    cursorY: pageHeight - MARGIN,
    pageNumber: 1,
    totalPagesRef: { value: 0 },
  };

  const blocks = text.split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) {
        layout.cursorY -= LINE_HEIGHT / 2;
        continue;
      }
      // Detect likely headings by length + uppercase ratio.
      const isHeading = trimmed.length < 90 && trimmed === trimmed.toUpperCase();
      writeLine(layout, trimmed, { bold: isHeading, size: isHeading ? FONT_SIZE + 2 : FONT_SIZE });
    }
  }

  const out = await pdf.save();
  return downloadResponse(out, `converted-${Date.now()}.pdf`, 'application/pdf');
});

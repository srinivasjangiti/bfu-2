/**
 * DOCX → PDF (Word Document to PDF).
 *
 * Uses mammoth to convert Word .docx into semantic HTML, parses headings,
 * paragraphs, lists, and tables, and lays out clean, typeset PDF pages
 * with real bold headings, bullet points, margins, and page numbers.
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

const MARGIN = 54; // 0.75 in
const FONT_SIZE = 10.5;
const LINE_HEIGHT = 15;

interface PageLayout {
  pdf: PDFDocument;
  pageWidth: number;
  pageHeight: number;
  usableWidth: number;
  font: any;
  boldFont: any;
  page: any;
  cursorY: number;
  pageNumber: number;
}

function ensureSpace(layout: PageLayout, neededHeight: number) {
  if (layout.cursorY - neededHeight < MARGIN) {
    layout.pageNumber += 1;
    layout.page = layout.pdf.addPage([layout.pageWidth, layout.pageHeight]);
    layout.cursorY = layout.pageHeight - MARGIN;
  }
}

function writeLine(
  layout: PageLayout,
  text: string,
  opts: { bold?: boolean; size?: number; indent?: number; color?: any } = {},
) {
  const size = opts.size ?? FONT_SIZE;
  const font = opts.bold ? layout.boldFont : layout.font;
  const indent = opts.indent ?? 0;
  const maxWidth = layout.usableWidth - indent;
  const color = opts.color ?? rgb(0.1, 0.12, 0.15);

  const words = text.split(/\s+/);
  let line = '';
  for (const w of words) {
    const trial = line.length === 0 ? w : `${line} ${w}`;
    let trialWidth = 0;
    try {
      trialWidth = font.widthOfTextAtSize(trial, size);
    } catch {
      trialWidth = trial.length * size * 0.55;
    }

    if (trialWidth > maxWidth) {
      if (line.length > 0) {
        ensureSpace(layout, LINE_HEIGHT);
        try {
          layout.page.drawText(line, {
            x: MARGIN + indent,
            y: layout.cursorY,
            size,
            font,
            color,
          });
        } catch {
          // If unsupported char, draw safe ascii
          layout.page.drawText(line.replace(/[^\x20-\x7E]/g, '?'), {
            x: MARGIN + indent,
            y: layout.cursorY,
            size,
            font,
            color,
          });
        }
        layout.cursorY -= LINE_HEIGHT;
        line = w;
      } else {
        ensureSpace(layout, LINE_HEIGHT);
        layout.page.drawText(w.slice(0, 50), {
          x: MARGIN + indent,
          y: layout.cursorY,
          size,
          font,
          color,
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
    try {
      layout.page.drawText(line, {
        x: MARGIN + indent,
        y: layout.cursorY,
        size,
        font,
        color,
      });
    } catch {
      layout.page.drawText(line.replace(/[^\x20-\x7E]/g, '?'), {
        x: MARGIN + indent,
        y: layout.cursorY,
        size,
        font,
        color,
      });
    }
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

  const html = result.value;

  // Split HTML into structural items (headings, list items, paragraphs)
  const items: Array<{ type: 'h1' | 'h2' | 'h3' | 'li' | 'p'; text: string }> = [];
  const tagRe = /<(h[1-3]|li|p|tr)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    const rawTag = match[1].toLowerCase();
    const cleanText = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();

    if (!cleanText) continue;

    if (rawTag === 'h1') items.push({ type: 'h1', text: cleanText });
    else if (rawTag === 'h2') items.push({ type: 'h2', text: cleanText });
    else if (rawTag === 'h3') items.push({ type: 'h3', text: cleanText });
    else if (rawTag === 'li') items.push({ type: 'li', text: cleanText });
    else items.push({ type: 'p', text: cleanText });
  }

  // Fallback if no tags matched
  if (items.length === 0) {
    const rawLines = html.replace(/<[^>]+>/g, '\n').split('\n');
    for (const l of rawLines) {
      if (l.trim()) items.push({ type: 'p', text: l.trim() });
    }
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [pageWidth, pageHeight] = PageSizes.Letter;

  const layout: PageLayout = {
    pdf,
    pageWidth,
    pageHeight,
    usableWidth: pageWidth - 2 * MARGIN,
    font,
    boldFont,
    page: pdf.addPage([pageWidth, pageHeight]),
    cursorY: pageHeight - MARGIN,
    pageNumber: 1,
  };

  for (const item of items) {
    if (item.type === 'h1') {
      ensureSpace(layout, 32);
      layout.cursorY -= 8;
      writeLine(layout, item.text, {
        bold: true,
        size: 18,
        color: rgb(0.08, 0.12, 0.2),
      });
      layout.cursorY -= 6;
    } else if (item.type === 'h2') {
      ensureSpace(layout, 26);
      layout.cursorY -= 6;
      writeLine(layout, item.text, {
        bold: true,
        size: 14,
        color: rgb(0.12, 0.16, 0.25),
      });
      layout.cursorY -= 4;
    } else if (item.type === 'h3') {
      ensureSpace(layout, 22);
      layout.cursorY -= 4;
      writeLine(layout, item.text, {
        bold: true,
        size: 12,
        color: rgb(0.15, 0.2, 0.3),
      });
      layout.cursorY -= 3;
    } else if (item.type === 'li') {
      ensureSpace(layout, LINE_HEIGHT);
      writeLine(layout, `•  ${item.text}`, {
        indent: 14,
        size: FONT_SIZE,
      });
      layout.cursorY -= 2;
    } else {
      // Paragraph
      ensureSpace(layout, LINE_HEIGHT);
      writeLine(layout, item.text, { size: FONT_SIZE });
      layout.cursorY -= 4; // Paragraph spacing
    }
  }

  // Draw page numbers on all pages
  const totalPages = pdf.getPageCount();
  pdf.getPages().forEach((p, idx) => {
    p.drawText(`Page ${idx + 1} of ${totalPages}`, {
      x: pageWidth - MARGIN - 70,
      y: 25,
      size: 8.5,
      font,
      color: rgb(0.5, 0.55, 0.6),
    });
  });

  const out = await pdf.save();
  return downloadResponse(out, `converted-${Date.now()}.pdf`, 'application/pdf');
});

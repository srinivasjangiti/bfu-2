/**
 * PDF → DOCX (PDF to Word Document).
 *
 * Extracts text and line structure from PDF pages via pdfjs-dist.
 * Converts headings, bullet lists, and paragraphs into real Word
 * elements using the docx library. If the PDF is image-only/scanned,
 * automatically falls back to OCR to extract text.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  PageBreak,
} from 'docx';
import {
  withErrorHandler,
  requiredFile,
  RouteError,
  fileToBytes,
  extractPdfText,
} from '../_shared/pdf-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 120;

export const POST = withErrorHandler(async (req: NextRequest): Promise<NextResponse> => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const includePageBreaks = formData.get('pageBreaks') !== 'false';
  const bytes = await fileToBytes(file);

  let parsed;
  try {
    parsed = await extractPdfText(bytes);
  } catch {
    throw new RouteError('PDF is invalid or corrupted.', 415, 'corrupt_pdf');
  }

  // Fallback to OCR if PDF has no extractable text (e.g. scanned document)
  if (!parsed.text || parsed.text.trim().length === 0) {
    try {
      const { createWorker } = await import('tesseract.js');
      const { createCanvas } = await import('@napi-rs/canvas');
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const pdf = await (pdfjs as any).getDocument({
        data: bytes,
        isEvalSupported: false,
        disableFontFace: true,
      }).promise;

      const worker = await createWorker('eng');
      const ocrPages = [];
      const pageCount = Math.min(pdf.numPages, 10);

      for (let i = 1; i <= pageCount; i += 1) {
        const page = await pdf.getPage(i);
        const vp = page.getViewport({ scale: 2.0 });
        const canvas = createCanvas(vp.width, vp.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, vp.width, vp.height);
        await page.render({ canvasContext: ctx as any, viewport: vp, canvas: canvas as any }).promise;
        const imgBuf = canvas.toBuffer('image/png');
        const res = await worker.recognize(imgBuf);
        const lines = (res.data?.text || '').split(/\r?\n/).filter((l: string) => l.trim().length > 0);
        ocrPages.push({ num: i, text: lines.join('\n'), lines });
      }
      await worker.terminate();

      if (ocrPages.length > 0) {
        parsed = {
          text: ocrPages.map(p => p.text).join('\n\n'),
          pageCount,
          pages: ocrPages,
        };
      }
    } catch (ocrErr) {
      console.warn('[pdf-to-word] OCR fallback failed:', ocrErr);
    }
  }

  if (!parsed.text || parsed.text.trim().length === 0) {
    throw new RouteError(
      'No extractable text was found in the PDF.',
      422,
      'no_text',
    );
  }

  const pages = parsed.pages;
  const children: Paragraph[] = [];

  pages.forEach((p, idx) => {
    if (idx > 0 && includePageBreaks) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
    const lines = p.lines;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;

      // Bullet item detection (•, -, *, 1.)
      const bulletMatch = trimmed.match(/^[\u2022\-\*\u25AA\u25CF]\s+(.+)$/);
      if (bulletMatch) {
        children.push(
          new Paragraph({
            text: bulletMatch[1],
            bullet: { level: 0 },
            spacing: { before: 60, after: 60 },
          }),
        );
        continue;
      }

      // Major Title detection (short ALL-CAPS line)
      if (trimmed.length < 60 && trimmed === trimmed.toUpperCase() && !/[0-9]/.test(trimmed)) {
        children.push(
          new Paragraph({
            text: trimmed,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 280, after: 140 },
          }),
        );
        continue;
      }

      // Section / Clause Heading heuristic
      const isLikelySectionHeading =
        trimmed.length < 90 &&
        (/^(section|article|clause|chapter|part|\d+\.)\b/i.test(trimmed) || trimmed === trimmed.toUpperCase());

      if (isLikelySectionHeading) {
        children.push(
          new Paragraph({
            text: trimmed,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 120 },
          }),
        );
      } else {
        children.push(
          new Paragraph({
            children: [new TextRun(trimmed)],
            spacing: { after: 120 },
          }),
        );
      }
    }
  });

  const doc = new Document({
    creator: 'BeforeYouSign PDF Tools',
    title: 'Converted Document',
    description: 'Generated from a PDF by BeforeYouSign.',
    sections: [
      {
        properties: {},
        children: children.length > 0
          ? children
          : [new Paragraph({ children: [new TextRun('(empty document)')] })],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="converted-${Date.now()}.docx"`,
      'Content-Length': String(buffer.byteLength),
    },
  });
});

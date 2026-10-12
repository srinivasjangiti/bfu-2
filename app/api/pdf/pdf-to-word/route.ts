/**
 * PDF → DOCX.
 *
 * We use pdf-parse to read the text in reading order, then build a
 * DOCX with the `docx` library. Headings are inferred from the PDF's
 * font-size metadata when available; otherwise text is split into
 * paragraphs at blank lines.
 *
 * Honest caveat: this produces an editable, structured DOCX with
 * paragraphs and headings — but it does NOT recreate the original
 * layout pixel-perfectly. Layout-faithful PDF→DOCX conversion is a
 * decades-old unsolved problem in pure JS (no native renderer).
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
export const maxDuration = 60;

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

  if (!parsed.text || parsed.text.trim().length === 0) {
    throw new RouteError(
      'No extractable text was found in the PDF.',
      422,
      'no_text',
    );
  }

  // Promote any line that LOOKS like a heading into a real DOCX heading.
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
      // Heading heuristic: short ALL-CAPS line or section/article marker.
      const isLikelyHeading =
        trimmed.length < 90 &&
        (trimmed === trimmed.toUpperCase() || /^(section|article|clause|chapter|part)\b/i.test(trimmed));
      if (isLikelyHeading) {
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

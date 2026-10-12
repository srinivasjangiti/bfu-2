/**
 * PPTX → PDF.
 *
 * We pull slide XML out of the PPTX (which is a zip of XML), grab the
 * text from each slide and render it as a PDF page. The output is a
 * real PDF with the slide content; rich layout, animations, and
 * embedded media are intentionally skipped.
 */
import { NextRequest } from 'next/server';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
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
const FONT_SIZE = 14;
const TITLE_SIZE = 22;
const LINE_HEIGHT = 20;

function extractText(xml: string): { title?: string; bullets: string[] } {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const parsed = parser.parse(xml);
  const result = { title: undefined as string | undefined, bullets: [] as string[] };
  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (typeof node === 'object') {
      if (node['a:t'] !== undefined) {
        const txt = String(node['a:t']).trim();
        if (txt) result.bullets.push(txt);
      }
      for (const k of Object.keys(node)) {
        if (k === 'a:t') continue;
        walk(node[k]);
      }
    }
  };
  walk(parsed);
  // Heuristic: the first non-empty text is the title, the rest are body.
  if (result.bullets.length > 0) {
    result.title = result.bullets.shift();
  }
  return result;
}

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const bytes = await fileToBytes(file);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new RouteError('PPTX file is not a valid zip archive.', 415, 'corrupt_pptx');
  }

  const slideFiles = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => {
      const an = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const bn = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return an - bn;
    });
  if (slideFiles.length === 0) {
    throw new RouteError('PPTX has no slides.', 422, 'empty_pptx');
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [pageW, pageH] = PageSizes.Letter;
  const usableW = pageW - 2 * MARGIN;

  const writeWrapped = (text: string, x: number, y: number, size: number, max: number, f: any): number => {
    const words = text.split(/\s+/);
    let line = '';
    let cy = y;
    for (const w of words) {
      const trial = line.length === 0 ? w : `${line} ${w}`;
      if (f.widthOfTextAtSize(trial, size) > max) {
        if (line.length > 0) {
          const page = pdf.getPages()[pdf.getPageCount() - 1];
          page.drawText(line, { x, y: cy, size, font: f, color: rgb(0.1, 0.1, 0.1) });
          cy -= LINE_HEIGHT;
          line = w;
        }
        if (cy < MARGIN) return cy;
      } else {
        line = trial;
      }
    }
    if (line.length > 0 && cy >= MARGIN) {
      const page = pdf.getPages()[pdf.getPageCount() - 1];
      page.drawText(line, { x, y: cy, size, font: f, color: rgb(0.1, 0.1, 0.1) });
      cy -= LINE_HEIGHT;
    }
    return cy;
  };

  for (let i = 0; i < slideFiles.length; i += 1) {
    const slideXml = await zip.files[slideFiles[i]].async('string');
    const { title, bullets } = extractText(slideXml);
    const page = pdf.addPage([pageW, pageH]);
    let y = pageH - MARGIN;
    if (title) {
      page.drawText(`Slide ${i + 1}: ${title.slice(0, 80)}`, {
        x: MARGIN, y, size: TITLE_SIZE, font: bold, color: rgb(0.07, 0.07, 0.07),
      });
      y -= TITLE_SIZE + 12;
    } else {
      page.drawText(`Slide ${i + 1}`, {
        x: MARGIN, y, size: TITLE_SIZE, font: bold, color: rgb(0.07, 0.07, 0.07),
      });
      y -= TITLE_SIZE + 12;
    }
    for (const b of bullets) {
      if (y < MARGIN + LINE_HEIGHT) break;
      // Bullet marker
      page.drawText('•', { x: MARGIN, y, size: FONT_SIZE, font, color: rgb(0.3, 0.3, 0.3) });
      y = writeWrapped(b, MARGIN + 16, y, FONT_SIZE, usableW - 16, font) - 4;
    }
  }

  const out = await pdf.save();
  return downloadResponse(out, `slides-${Date.now()}.pdf`, 'application/pdf');
});

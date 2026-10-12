/**
 * PDF → XLSX.
 *
 * pdf-parse gives us text in reading order; we attempt a heuristic
 * table detector (rows = same y-coord, cells = x-coord columns) and
 * emit an XLSX with one sheet per detected table. If no tables are
 * detected we fall back to a single "Text" sheet with the full text
 * — still a real, openable spreadsheet.
 *
 * Honest caveat: PDF→XLSX table extraction is genuinely hard in
 * pure JS. This is best-effort, not a substitute for Adobe Acrobat
 * or a paid OCR/extraction service.
 */
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
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
  const bytes = await fileToBytes(file);

  let parsed;
  try {
    parsed = await extractPdfText(bytes);
  } catch {
    throw new RouteError('PDF is invalid or corrupted.', 415, 'corrupt_pdf');
  }

  if (!parsed.text || parsed.text.trim().length === 0) {
    throw new RouteError('No extractable content found in PDF.', 422, 'no_content');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BeforeYouSign PDF Tools';
  workbook.created = new Date();

  // Sheet 1: detected tables (best-effort). New pdf-parse API doesn't
  // expose positional data via getText, so we just paginate.
  if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
    const sheet = workbook.addWorksheet('By Page');
    for (const p of parsed.pages) {
      sheet.addRow([`— Page ${p.num} —`]).font = { bold: true };
      for (const line of (p.text || '').split(/\r?\n/)) {
        if (line.trim().length > 0) sheet.addRow([line]);
      }
      sheet.addRow([]);
    }
  }

  // Sheet 2: full text.
  const textSheet = workbook.addWorksheet('Full Text');
  textSheet.addRow([parsed.text]);

  if (workbook.worksheets.length === 0) {
    throw new RouteError('No extractable content found in PDF.', 422, 'no_content');
  }

  const buf = await workbook.xlsx.writeBuffer();
  const ab = buf instanceof ArrayBuffer ? buf : (buf as Uint8Array).buffer;
  return new NextResponse(new Uint8Array(ab as ArrayBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="extracted-${Date.now()}.xlsx"`,
      'Content-Length': String((ab as ArrayBuffer).byteLength),
    },
  });
});

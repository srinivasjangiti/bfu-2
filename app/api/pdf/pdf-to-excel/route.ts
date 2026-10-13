/**
 * PDF → XLSX (Excel Spreadsheet).
 *
 * Extracts text from PDF pages, detects table rows and columns using
 * tab, pipe, multi-space, and CSV-like delimiters, parses numbers/currencies
 * into real Excel numeric cells, auto-sizes column widths, and produces
 * a structured, openable XLSX workbook.
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

function parseCellValue(str: string): string | number {
  const trimmed = str.trim();
  if (!trimmed) return '';

  // Clean currency and comma separators: $1,234.50 or €99.00
  const clean = trimmed.replace(/^[\$€£₹¥]/, '').replace(/,/g, '');
  if (clean && !isNaN(Number(clean)) && !/^[0-9]+-[0-9]+/.test(trimmed)) {
    return Number(clean);
  }
  return trimmed;
}

function splitLineIntoCells(line: string): (string | number)[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // Tab delimited
  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map(c => parseCellValue(c)).filter(c => c !== '');
  }

  // Pipe delimited (| Col 1 | Col 2 |)
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map(c => parseCellValue(c)).filter(c => c !== '');
    if (parts.length > 0) return parts;
  }

  // Multi-space delimited (2 or more spaces between columns)
  if (/\s{2,}/.test(trimmed)) {
    return trimmed.split(/\s{2,}/).map(c => parseCellValue(c)).filter(c => c !== '');
  }

  // Comma delimited (if line has at least 2 commas with data)
  if (trimmed.includes(',') && /^[^,]+,\s*[^,]+,\s*[^,]+/.test(trimmed)) {
    return trimmed.split(',').map(c => parseCellValue(c)).filter(c => c !== '');
  }

  return [parseCellValue(trimmed)];
}

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

  // Sheet 1: Structured Tables / By Page
  const sheet = workbook.addWorksheet('Extracted Tables', {
    views: [{ showGridLines: true }],
  });

  if (Array.isArray(parsed.pages) && parsed.pages.length > 0) {
    for (const p of parsed.pages) {
      // Page header banner
      const bannerRow = sheet.addRow([`Page ${p.num}`]);
      bannerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      bannerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }, // Slate 800
      };

      const lines = (p.text || '').split(/\r?\n/);
      let isFirstTableLine = true;

      for (const line of lines) {
        if (!line.trim()) continue;
        const cells = splitLineIntoCells(line);
        if (cells.length === 0) continue;

        const row = sheet.addRow(cells);

        // Highlight likely header row
        if (cells.length > 1 && isFirstTableLine) {
          row.font = { bold: true };
          row.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' }, // Slate 100
          };
          isFirstTableLine = false;
        }
      }

      sheet.addRow([]); // Blank spacer row between pages
    }

    // Auto-calculate column widths
    sheet.columns.forEach(column => {
      let maxLen = 10;
      column.eachCell?.({ includeEmpty: false }, cell => {
        const valStr = String(cell.value ?? '');
        if (valStr.length > maxLen) {
          maxLen = Math.min(valStr.length, 60);
        }
      });
      column.width = Math.max(maxLen + 3, 12);
    });
  }

  // Sheet 2: Raw Full Text backup
  const textSheet = workbook.addWorksheet('Full Text');
  const textLines = parsed.text.split(/\r?\n/);
  for (const line of textLines) {
    if (line.trim().length > 0) {
      textSheet.addRow([line]);
    }
  }
  textSheet.getColumn(1).width = 80;

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

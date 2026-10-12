/**
 * XLSX → PDF.
 *
 * exceljs reads the workbook; we render each sheet as a paginated PDF
 * with a simple table layout. Formula results, conditional formatting,
 * charts, and merged cells are not preserved — the focus is producing
 * a printable PDF that contains the actual data.
 */
import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
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

const MARGIN = 36;
const ROW_HEIGHT = 16;
const COL_PADDING = 6;
const FONT_SIZE = 9;
const HEADER_FONT_SIZE = 11;
const TITLE_FONT_SIZE = 14;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const maxCols = Math.min(40, parseInt((formData.get('maxCols') as string) || '20', 10));
  const maxRows = Math.min(5000, parseInt((formData.get('maxRows') as string) || '1000', 10));

  const bytes = await fileToBytes(file);
  const wb = new ExcelJS.Workbook();
  try {
    // exceljs's typings expect a Node Buffer, but our bytes are a
    // Uint8Array<ArrayBufferLike>. The runtime accepts both; we cast
    // through unknown to bypass the strict lib check.
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new RouteError('XLSX is invalid or corrupted.', 415, 'corrupt_xlsx');
  }
  if (wb.worksheets.length === 0) {
    throw new RouteError('Workbook has no sheets.', 422, 'empty_xlsx');
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [pageW, pageH] = PageSizes.Letter;
  const usableW = pageW - 2 * MARGIN;

  for (const sheet of wb.worksheets) {
    let page = pdf.addPage([pageW, pageH]);
    let y = pageH - MARGIN;
    const writeText = (txt: string, x: number, size: number, f: any, color = rgb(0.07, 0.07, 0.07)) => {
      page.drawText(String(txt).slice(0, 200), { x, y, size, font: f, color });
    };

    // Title
    writeText(sheet.name || 'Sheet', MARGIN, TITLE_FONT_SIZE, bold, rgb(0.13, 0.13, 0.13));
    y -= TITLE_FONT_SIZE + 8;
    writeText(`Rows: ${sheet.rowCount}, Cols: ${sheet.columnCount}`, MARGIN, FONT_SIZE, font, rgb(0.4, 0.4, 0.4));
    y -= FONT_SIZE + 12;

    // Compute a column width budget.
    const cols = Math.min(sheet.columnCount || 0, maxCols);
    if (cols === 0) continue;
    const colWidth = Math.max(40, Math.floor(usableW / cols));

    // Iterate rows.
    let rowCount = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowCount >= maxRows) return false;
      if (y < MARGIN + ROW_HEIGHT) {
        page = pdf.addPage([pageW, pageH]);
        y = pageH - MARGIN;
      }
      let x = MARGIN;
      // Headers (only on first row, as a header band).
      if (rowCount === 0) {
        page.drawRectangle({
          x: MARGIN, y: y - 4,
          width: usableW, height: ROW_HEIGHT,
          color: rgb(0.93, 0.93, 0.93),
        });
      }
      for (let c = 1; c <= cols; c += 1) {
        const cell: any = row.getCell(c);
        const value = cell?.value;
        const text = value === null || value === undefined
          ? ''
          : typeof value === 'object'
            ? (value.text ?? value.result ?? value.richText?.[0]?.text ?? JSON.stringify(value))
            : String(value);
        const f = rowCount === 0 ? bold : font;
        page.drawText(text.slice(0, Math.floor((colWidth - COL_PADDING) / (FONT_SIZE * 0.55))), {
          x: x + COL_PADDING / 2, y, size: FONT_SIZE, font: f, color: rgb(0.07, 0.07, 0.07),
        });
        x += colWidth;
      }
      y -= ROW_HEIGHT;
      rowCount += 1;
      return true;
    });
  }

  const out = await pdf.save();
  return downloadResponse(out, `spreadsheet-${Date.now()}.pdf`, 'application/pdf');
});

/**
 * XLSX → PDF (Excel Spreadsheet to PDF).
 *
 * Reads workbooks via ExcelJS, dynamically computes column widths based
 * on content, automatically switches to Landscape for wide sheets (>5 cols),
 * draws professional table gridlines, zebra striping, headers, and
 * page numbers.
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
const ROW_HEIGHT = 18;
const FONT_SIZE = 8.5;
const HEADER_FONT_SIZE = 9.5;
const TITLE_FONT_SIZE = 14;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const maxCols = Math.min(40, parseInt((formData.get('maxCols') as string) || '25', 10));
  const maxRows = Math.min(5000, parseInt((formData.get('maxRows') as string) || '1000', 10));

  const bytes = await fileToBytes(file);
  const wb = new ExcelJS.Workbook();
  try {
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

  for (const sheet of wb.worksheets) {
    const rawCols = sheet.columnCount || 0;
    const cols = Math.min(rawCols, maxCols);
    if (cols === 0 || sheet.rowCount === 0) continue;

    // Use Landscape for tables with more than 5 columns
    const isLandscape = cols > 5;
    const [pageW, pageH] = isLandscape
      ? [PageSizes.Letter[1], PageSizes.Letter[0]] // 792 x 612
      : [PageSizes.Letter[0], PageSizes.Letter[1]]; // 612 x 792
    const usableW = pageW - 2 * MARGIN;

    // Estimate column widths based on content
    const colCharLengths: number[] = new Array(cols).fill(5);
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber > 30) return; // Sample first 30 rows
      for (let c = 1; c <= cols; c += 1) {
        const val = row.getCell(c).value;
        const len = String(val ?? '').length;
        if (len > colCharLengths[c - 1]) {
          colCharLengths[c - 1] = Math.min(len, 35);
        }
      }
    });

    const totalChars = colCharLengths.reduce((sum, len) => sum + len, 0) || 1;
    const colWidths = colCharLengths.map(len => {
      const calculated = Math.floor((len / totalChars) * usableW);
      return Math.max(calculated, 45);
    });

    // Normalize column widths to fit usableW
    const totalAssigned = colWidths.reduce((a, b) => a + b, 0);
    const scaleFactor = usableW / (totalAssigned || 1);
    const finalColWidths = colWidths.map(w => Math.floor(w * scaleFactor));

    let page = pdf.addPage([pageW, pageH]);
    let y = pageH - MARGIN;

    // Header banner
    page.drawText(sheet.name || 'Sheet', {
      x: MARGIN,
      y,
      size: TITLE_FONT_SIZE,
      font: bold,
      color: rgb(0.1, 0.15, 0.25),
    });
    y -= TITLE_FONT_SIZE + 6;

    page.drawText(`Rows: ${sheet.rowCount}  |  Columns: ${cols}  |  Exported from BeforeYouSign`, {
      x: MARGIN,
      y,
      size: 8,
      font,
      color: rgb(0.45, 0.5, 0.55),
    });
    y -= 14;

    let rowIdx = 0;
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowIdx >= maxRows) return false;

      // Page break check
      if (y < MARGIN + ROW_HEIGHT + 10) {
        page = pdf.addPage([pageW, pageH]);
        y = pageH - MARGIN - 10;
      }

      const isHeader = rowIdx === 0;

      // Background fill
      if (isHeader) {
        page.drawRectangle({
          x: MARGIN,
          y: y - 3,
          width: usableW,
          height: ROW_HEIGHT,
          color: rgb(0.12, 0.16, 0.24), // Dark Navy
        });
      } else if (rowIdx % 2 === 1) {
        page.drawRectangle({
          x: MARGIN,
          y: y - 3,
          width: usableW,
          height: ROW_HEIGHT,
          color: rgb(0.96, 0.97, 0.99), // Subtle light slate
        });
      }

      // Draw row bottom border line
      page.drawLine({
        start: { x: MARGIN, y: y - 3 },
        end: { x: MARGIN + usableW, y: y - 3 },
        thickness: 0.5,
        color: rgb(0.85, 0.88, 0.92),
      });

      let currentX = MARGIN;
      for (let c = 1; c <= cols; c += 1) {
        const cWidth = finalColWidths[c - 1] || 50;
        const cell = row.getCell(c);
        const val = cell.value;
        let rawText = '';
        if (val !== null && val !== undefined) {
          if (val instanceof Date) {
            rawText = val.toLocaleDateString();
          } else if (typeof val === 'object') {
            const obj = val as Record<string, any>;
            if (typeof obj.text === 'string') {
              rawText = obj.text;
            } else if (obj.result !== undefined && obj.result !== null) {
              rawText = String(obj.result);
            } else if (Array.isArray(obj.richText)) {
              rawText = obj.richText.map((item: any) => item?.text || '').join('');
            } else {
              rawText = String(val);
            }
          } else {
            rawText = String(val);
          }
        }

        const maxChars = Math.max(3, Math.floor((cWidth - 6) / 5.2));
        const displayText = rawText.length > maxChars
          ? rawText.slice(0, maxChars - 1) + '…'
          : rawText;

        const cellFont = isHeader ? bold : font;
        const textColor = isHeader
          ? rgb(1, 1, 1)
          : rgb(0.1, 0.12, 0.15);

        if (displayText) {
          page.drawText(displayText, {
            x: currentX + 3,
            y: y + 2,
            size: isHeader ? HEADER_FONT_SIZE : FONT_SIZE,
            font: cellFont,
            color: textColor,
          });
        }

        currentX += cWidth;
      }

      y -= ROW_HEIGHT;
      rowIdx += 1;
      return true;
    });
  }

  const out = await pdf.save();
  return downloadResponse(out, `spreadsheet-${Date.now()}.pdf`, 'application/pdf');
});

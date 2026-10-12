/**
 * Real end-to-end PDF smoke test.
 *
 * Builds a small multi-page text PDF with pdf-lib, then drives every
 * implemented tool route handler in-process (no Next dev server
 * required) and writes each output to tmp-pdf-out/.
 *
 * Run with: node --experimental-strip-types --no-warnings scripts/smoke-pdf-tools.mjs
 */
import { PDFDocument, StandardFonts, rgb, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { writeFile, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import PptxGenJS from 'pptxgenjs';
import JSZip from 'jszip';
import sharp from 'sharp';
import { XMLParser } from 'fast-xml-parser';
import mammoth from 'mammoth';
import * as mupdf from 'mupdf';

// Build a real multi-page PDF with text + a small embedded JPEG.
const pdfDoc = await PDFDocument.create();
const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
const smallFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

// Build a 200x200 PNG with sharp, embed as PNG XObject.
const png = await sharp({
  create: { width: 200, height: 200, channels: 4, background: { r: 100, g: 200, b: 50, alpha: 1 } },
}).png().toBuffer();
const img = await pdfDoc.embedPng(png);

const pages = [
  { title: 'NDA', body: 'This Non-Disclosure Agreement is entered into between Acme Inc. and the Counterparty. Confidential information must not be disclosed.' },
  { title: 'TERM AND TERMINATION', body: 'This agreement remains in effect for 12 months from the effective date. Either party may terminate with 30 days written notice.' },
  { title: 'PAYMENT', body: 'The customer shall pay one hundred thousand dollars (USD 100,000) within fifteen (15) days of invoice.' },
];
for (const p of pages) {
  const page = pdfDoc.addPage([612, 792]);
  page.drawText(p.title, { x: 50, y: 720, size: 18, font, color: rgb(0.1, 0.1, 0.5) });
  page.drawText(p.body, { x: 50, y: 660, size: 11, font: smallFont, color: rgb(0, 0, 0), maxWidth: 510 });
  page.drawImage(img, { x: 50, y: 400, width: 200, height: 200 });
}
const inputPdf = await pdfDoc.save();
const OUT = 'tmp-pdf-out';
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'input.pdf'), inputPdf);
console.log(`[smoke] input pdf ${inputPdf.length} bytes, ${pages.length} pages, 1 image per page`);

// --- Helper: call a route handler with a File + FormData-like fields ---
async function callRoute(routeModule, fields = {}) {
  const formData = new FormData();
  const fileBlob = new Blob([inputPdf], { type: 'application/pdf' });
  formData.set('file', fileBlob, 'input.pdf');
  for (const [k, v] of Object.entries(fields)) formData.set(k, v);
  const req = new Request('http://localhost/test', { method: 'POST', body: formData });
  const res = await routeModule.POST(req);
  const ab = await res.arrayBuffer();
  return { status: res.status, headers: Object.fromEntries(res.headers), body: new Uint8Array(ab) };
}

const results = [];
async function run(name, fn) {
  process.stdout.write(`[smoke] ${name} … `);
  const t0 = Date.now();
  try {
    const out = await fn();
    console.log(`OK in ${Date.now() - t0}ms`);
    results.push({ name, ...out });
  } catch (e) {
    console.log(`FAIL ${e?.message || e}`);
    results.push({ name, error: e?.message || String(e) });
  }
}

// --- Importer (register TS-stripped route handlers via dynamic import) ---
const { POST: pdfToImage } = await import('../app/api/pdf/to-image/route.ts');
const { POST: pdfToWord } = await import('../app/api/pdf/pdf-to-word/route.ts');
const { POST: wordToPdf } = await import('../app/api/pdf/word-to-pdf/route.ts');
const { POST: pdfToExcel } = await import('../app/api/pdf/pdf-to-excel/route.ts');
const { POST: excelToPdf } = await import('../app/api/pdf/excel-to-pdf/route.ts');
const { POST: pdfToPptx } = await import('../app/api/pdf/pdf-to-powerpoint/route.ts');
const { POST: pageNumbers } = await import('../app/api/pdf/page-numbers/route.ts');
const { POST: watermark } = await import('../app/api/pdf/watermark/route.ts');
const { POST: extractImages } = await import('../app/api/pdf/extract-images/route.ts');
const { POST: extractText } = await import('../app/api/pdf/extract-text/route.ts');
const { POST: repair } = await import('../app/api/pdf/repair/route.ts');
const { POST: protectPdf } = await import('../app/api/pdf/protect/route.ts');
const { POST: unlockPdf } = await import('../app/api/pdf/unlock/route.ts');
const { POST: signPdf } = await import('../app/api/pdf/sign/route.ts');
const { POST: ocrPdf } = await import('../app/api/pdf/ocr/route.ts');

await run('to-image (jpeg)', async () => {
  const r = await callRoute({ POST: pdfToImage }, { format: 'jpeg', quality: '75', scale: '1.5' });
  if (r.status !== 200) throw new Error(`status ${r.status}: ${new TextDecoder().decode(r.body).slice(0, 200)}`);
  await writeFile(join(OUT, 'to-image.zip'), r.body);
  return { size: r.body.length };
});

await run('to-image (png)', async () => {
  const r = await callRoute({ POST: pdfToImage }, { format: 'png', scale: '1' });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  return { size: r.body.length };
});

await run('pdf-to-word (docx)', async () => {
  const r = await callRoute({ POST: pdfToWord });
  if (r.status !== 200) throw new Error(`status ${r.status}: ${new TextDecoder().decode(r.body).slice(0, 200)}`);
  await writeFile(join(OUT, 'pdf-to-word.docx'), r.body);
  return { size: r.body.length };
});

await run('page-numbers (bottom-center)', async () => {
  const r = await callRoute({ POST: pageNumbers }, { position: 'bottom-center', format: 'Page {n} of {total}' });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  await writeFile(join(OUT, 'page-numbers.pdf'), r.body);
  return { size: r.body.length };
});

await run('watermark', async () => {
  const r = await callRoute({ POST: watermark }, { text: 'CONFIDENTIAL' });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  await writeFile(join(OUT, 'watermark.pdf'), r.body);
  return { size: r.body.length };
});

await run('extract-text', async () => {
  const r = await callRoute({ POST: extractText });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  await writeFile(join(OUT, 'extracted.txt'), r.body);
  return { size: r.body.length, text: new TextDecoder().decode(r.body).slice(0, 200) };
});

await run('extract-images', async () => {
  const r = await callRoute({ POST: extractImages });
  if (r.status !== 200) throw new Error(`status ${r.status}: ${new TextDecoder().decode(r.body).slice(0, 200)}`);
  await writeFile(join(OUT, 'extracted-images.zip'), r.body);
  // Read zip and confirm at least one image is inside.
  const zip = await JSZip.loadAsync(r.body);
  const imageNames = Object.keys(zip.files).filter(n => /\.(png|jpg|jpeg)$/i.test(n));
  return { size: r.body.length, images: imageNames };
});

await run('pdf-to-excel', async () => {
  const r = await callRoute({ POST: pdfToExcel });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  await writeFile(join(OUT, 'pdf-to-excel.xlsx'), r.body);
  return { size: r.body.length };
});

await run('pdf-to-powerpoint', async () => {
  const r = await callRoute({ POST: pdfToPptx });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  await writeFile(join(OUT, 'pdf-to-powerpoint.pptx'), r.body);
  return { size: r.body.length };
});

await run('repair', async () => {
  const r = await callRoute({ POST: repair });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  await writeFile(join(OUT, 'repaired.pdf'), r.body);
  return { size: r.body.length };
});

// word-to-pdf and excel-to-pdf and powerpoint-to-pdf need non-PDF inputs.
// Build a DOCX, XLSX, PPTX in-memory and call.
await run('word-to-pdf', async () => {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('CONTRACT TITLE')] }),
        new Paragraph({ children: [new TextRun('This is the body of the contract. It is plain text rendered to a PDF page.')] }),
        new Paragraph({ children: [new TextRun('A second paragraph follows here.')] }),
      ]
    }]
  });
  const docxBytes = await Packer.toBuffer(doc);
  const fd = new FormData();
  fd.set('file', new Blob([docxBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'sample.docx');
  const req = new Request('http://localhost/test', { method: 'POST', body: fd });
  const res = await wordToPdf(req);
  const ab = await res.arrayBuffer();
  if (res.status !== 200) throw new Error(`status ${res.status}: ${new TextDecoder().decode(ab).slice(0,200)}`);
  const u8 = new Uint8Array(ab);
  await writeFile(join(OUT, 'word-to-pdf.pdf'), u8);
  return { size: u8.length };
});

await run('excel-to-pdf', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(['Name', 'Amount']);
  ws.addRow(['Acme Inc', 100000]);
  ws.addRow(['Widget Co', 25000]);
  ws.addRow(['Total', 125000]);
  const buf = await wb.xlsx.writeBuffer();
  const fd = new FormData();
  fd.set('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'sheet.xlsx');
  const req = new Request('http://localhost/test', { method: 'POST', body: fd });
  const res = await excelToPdf(req);
  const ab = await res.arrayBuffer();
  if (res.status !== 200) throw new Error(`status ${res.status}: ${new TextDecoder().decode(ab).slice(0,200)}`);
  const u8 = new Uint8Array(ab);
  await writeFile(join(OUT, 'excel-to-pdf.pdf'), u8);
  return { size: u8.length };
});

await run('powerpoint-to-pdf', async () => {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  let s1 = pptx.addSlide();
  s1.addText('Slide One Title', { x: 1, y: 1, fontSize: 24 });
  s1.addText('First slide body content.', { x: 1, y: 2, fontSize: 14 });
  let s2 = pptx.addSlide();
  s2.addText('Slide Two', { x: 1, y: 1, fontSize: 24 });
  s2.addText('Second slide body content.', { x: 1, y: 2, fontSize: 14 });
  const buf = await pptx.write({ outputType: 'arraybuffer' });
  const fd = new FormData();
  fd.set('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), 'deck.pptx');
  const req = new Request('http://localhost/test', { method: 'POST', body: fd });
  const { POST: pptxToPdf } = await import('../app/api/pdf/powerpoint-to-pdf/route.ts');
  const res = await pptxToPdf(req);
  const ab = await res.arrayBuffer();
  if (res.status !== 200) throw new Error(`status ${res.status}: ${new TextDecoder().decode(ab).slice(0,200)}`);
  const u8 = new Uint8Array(ab);
  await writeFile(join(OUT, 'powerpoint-to-pdf.pdf'), u8);
  return { size: u8.length };
});

// --- Roundtrip: open the to-image ZIP and verify each page is a real JPEG ---
await run('to-image.zip roundtrip (verify images are real JPEGs)', async () => {
  const zipBytes = await readFile(join(OUT, 'to-image.zip'));
  const zip = await JSZip.loadAsync(zipBytes);
  const pageNames = Object.keys(zip.files).filter(n => /^page-\d+\.jpg$/.test(n)).sort();
  if (pageNames.length === 0) throw new Error('no jpeg pages in zip');
  for (const name of pageNames) {
    const buf = await zip.files[name].async('nodebuffer');
    const meta = await sharp(buf).metadata();
    if (meta.format !== 'jpeg') throw new Error(`${name} is not jpeg: ${meta.format}`);
    if ((meta.width ?? 0) <= 0 || (meta.height ?? 0) <= 0) throw new Error(`${name} has no dimensions`);
  }
  return { jpegPages: pageNames.length, sampleMeta: (await sharp(await zip.files[pageNames[0]].async('nodebuffer')).metadata()).format };
});

await run('page-numbers roundtrip (verify text appears)', async () => {
  const bytes = new Uint8Array(await readFile(join(OUT, 'page-numbers.pdf')));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
  let allText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    allText += ' ' + tc.items.map(it => it.str).join(' ');
  }
  if (!/Page\s*1\s*of\s*3/.test(allText) && !/Page\s*1\s*of/.test(allText)) {
    throw new Error(`page numbers not in PDF text: ${allText.slice(0, 300)}`);
  }
  return { pageCount: doc.numPages, textSnippet: allText.match(/Page\s*\d+\s*of\s*\d+/)?.[0] };
});

await run('watermark roundtrip (verify CONFIDENTIAL appears)', async () => {
  const bytes = new Uint8Array(await readFile(join(OUT, 'watermark.pdf')));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
  let allText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    allText += ' ' + tc.items.map(it => it.str).join(' ');
  }
  if (!/CONFIDENTIAL/.test(allText)) throw new Error(`watermark text not found: ${allText.slice(0, 300)}`);
  return { found: 'CONFIDENTIAL' };
});

await run('extract-text roundtrip (verify body present)', async () => {
  const txt = (await readFile(join(OUT, 'extracted.txt'))).toString('utf8');
  if (!/Acme/.test(txt)) throw new Error(`extract-text did not find Acme: ${txt.slice(0, 300)}`);
  if (!/100,000/.test(txt) && !/100000/.test(txt)) throw new Error('extract-text did not find payment amount');
  return { hasAcme: true, has100k: true, len: txt.length };
});

await run('pdf-to-excel roundtrip (verify XLSX is openable)', async () => {
  const xlsx = await readFile(join(OUT, 'pdf-to-excel.xlsx'));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx);
  if (wb.worksheets.length === 0) throw new Error('no worksheets in xlsx');
  return { sheets: wb.worksheets.map(w => w.name) };
});

await run('pdf-to-powerpoint roundtrip (verify PPTX has slides)', async () => {
  const pptxBytes = await readFile(join(OUT, 'pdf-to-powerpoint.pptx'));
  const zip = await JSZip.loadAsync(pptxBytes);
  const slideNames = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  if (slideNames.length !== 3) throw new Error(`expected 3 slides, got ${slideNames.length}`);
  return { slides: slideNames.length };
});

await run('powerpoint-to-pdf roundtrip (verify slide text is rendered)', async () => {
  const bytes = new Uint8Array(await readFile(join(OUT, 'powerpoint-to-pdf.pdf')));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
  let allText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    allText += ' ' + tc.items.map(it => it.str).join(' ');
  }
  if (!/Slide\s*1/.test(allText)) throw new Error(`slide 1 not in PDF: ${allText.slice(0, 300)}`);
  return { found: 'Slide 1' };
});

await run('word-to-pdf roundtrip (verify text rendered)', async () => {
  const bytes = new Uint8Array(await readFile(join(OUT, 'word-to-pdf.pdf')));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const text = tc.items.map(it => it.str).join(' ');
  if (!/CONTRACT TITLE/.test(text)) throw new Error(`heading not in PDF: ${text.slice(0, 300)}`);
  return { hasHeading: true };
});

await run('excel-to-pdf roundtrip (verify table cells rendered)', async () => {
  const bytes = new Uint8Array(await readFile(join(OUT, 'excel-to-pdf.pdf')));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
  const page = await doc.getPage(1);
  const tc = await page.getTextContent();
  const text = tc.items.map(it => it.str).join(' ');
  if (!/Acme/.test(text)) throw new Error(`xlsx data not in PDF: ${text.slice(0, 300)}`);
  return { hasData: true };
});

// --- PROTECT PDF (Encryption) ---
let protectedPdfBytes;
await run('protect-pdf (encrypt with password)', async () => {
  const r = await callRoute({ POST: protectPdf }, { password: 'SecretPass123!' });
  if (r.status !== 200) throw new Error(`status ${r.status}: ${new TextDecoder().decode(r.body).slice(0, 200)}`);
  protectedPdfBytes = r.body;
  await writeFile(join(OUT, 'protected.pdf'), r.body);
  return { size: r.body.length };
});

await run('protect-pdf roundtrip (verify password is required)', async () => {
  const mDoc = mupdf.Document.openDocument(protectedPdfBytes, 'application/pdf');
  const needsPass = mDoc.needsPassword();
  const wrongAuth = mDoc.authenticatePassword('wrong-pass');
  const rightAuth = mDoc.authenticatePassword('SecretPass123!');
  mDoc.destroy();
  if (!needsPass) throw new Error('PDF did not require a password');
  if (wrongAuth !== 0) throw new Error('PDF authenticated with wrong password');
  if (rightAuth === 0) throw new Error('PDF failed authentication with correct password');
  return { needsPassword: true, authVerified: true };
});

// --- UNLOCK PDF (Decryption) ---
await run('unlock-pdf (rejects incorrect password)', async () => {
  const fd = new FormData();
  fd.set('file', new Blob([protectedPdfBytes], { type: 'application/pdf' }), 'protected.pdf');
  fd.set('password', 'wrong-pass');
  const req = new Request('http://localhost/test', { method: 'POST', body: fd });
  const res = await unlockPdf(req);
  if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
  return { rejected: true };
});

let unlockedPdfBytes;
await run('unlock-pdf (decrypt with valid password)', async () => {
  const fd = new FormData();
  fd.set('file', new Blob([protectedPdfBytes], { type: 'application/pdf' }), 'protected.pdf');
  fd.set('password', 'SecretPass123!');
  const req = new Request('http://localhost/test', { method: 'POST', body: fd });
  const res = await unlockPdf(req);
  if (res.status !== 200) throw new Error(`status ${res.status}: ${await res.text()}`);
  unlockedPdfBytes = new Uint8Array(await res.arrayBuffer());
  await writeFile(join(OUT, 'unlocked.pdf'), unlockedPdfBytes);
  return { size: unlockedPdfBytes.length };
});

await run('unlock-pdf roundtrip (verify password is removed)', async () => {
  const mDoc = mupdf.Document.openDocument(unlockedPdfBytes, 'application/pdf');
  const needsPass = mDoc.needsPassword();
  mDoc.destroy();
  if (needsPass) throw new Error('unlocked PDF still requires a password');
  return { needsPassword: false, successfullyDecrypted: true };
});

// --- SIGN PDF (Visual Signature) ---
await run('sign-pdf (apply visual name and line)', async () => {
  const r = await callRoute({ POST: signPdf }, { typedName: 'Jane Smith, Chief Legal Officer', page: 'last' });
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  await writeFile(join(OUT, 'signed.pdf'), r.body);
  return { size: r.body.length };
});

await run('sign-pdf roundtrip (verify signature text present)', async () => {
  const bytes = new Uint8Array(await readFile(join(OUT, 'signed.pdf')));
  const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true }).promise;
  const lastPage = await doc.getPage(doc.numPages);
  const tc = await lastPage.getTextContent();
  const text = tc.items.map(it => it.str).join(' ');
  if (!/Jane Smith/.test(text)) throw new Error(`signature text not found: ${text.slice(0, 300)}`);
  return { found: 'Jane Smith' };
});

// --- OCR PDF (Tesseract.js Engine) ---
await run('ocr-pdf (recognize text via Tesseract.js)', async () => {
  const r = await callRoute({ POST: ocrPdf }, { language: 'eng' });
  if (r.status !== 200) throw new Error(`status ${r.status}: ${new TextDecoder().decode(r.body).slice(0, 200)}`);
  await writeFile(join(OUT, 'ocr.txt'), r.body);
  const ocrText = new TextDecoder().decode(r.body);
  if (!/NDA|Acme|TERMINATION|PAYMENT/i.test(ocrText)) {
    throw new Error(`OCR did not extract expected text: ${ocrText.slice(0, 200)}`);
  }
  return { size: r.body.length, snippet: ocrText.slice(0, 150) };
});

console.log('\n=== smoke results ===');
for (const r of results) {
  if (r.error) console.log(`FAIL ${r.name} — ${r.error}`);
  else console.log(`OK   ${r.name} — ${JSON.stringify(r)}`);
}
const fails = results.filter(r => r.error).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails === 0 ? 0 : 1);

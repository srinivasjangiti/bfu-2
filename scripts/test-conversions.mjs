import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';

const BASE = 'http://localhost:3000';

async function generateSamplePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([600, 400]);

  page.drawText('BEFORE YOU SIGN AGREEMENT', { x: 50, y: 350, size: 18, font: bold });
  page.drawText('1. Definitions and Parties', { x: 50, y: 300, size: 14, font: bold });
  page.drawText('Item\tQuantity\tPrice', { x: 50, y: 260, size: 12, font });
  page.drawText('Widget A\t10\t$250.00', { x: 50, y: 240, size: 12, font });
  page.drawText('Widget B\t5\t$100.00', { x: 50, y: 220, size: 12, font });
  page.drawText('Total\t15\t$350.00', { x: 50, y: 190, size: 12, font: bold });
  return await pdf.save();
}

async function generateSampleDocx() {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ children: [new TextRun({ text: 'Sample Legal Contract', bold: true, size: 28 })] }),
        new Paragraph({ children: [new TextRun({ text: 'Section 1. Confidentiality Obligations', bold: true, size: 22 })] }),
        new Paragraph({ children: [new TextRun('All recipient information must be kept confidential.')] }),
        new Paragraph({ text: 'No disclosure to third parties.', bullet: { level: 0 } }),
      ]
    }]
  });
  return await Packer.toBuffer(doc);
}

async function generateSampleXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Q1 Revenue');
  ws.addRow(['Quarter', 'Revenue', 'Expenses', 'Profit']);
  ws.addRow(['Q1 2026', 150000, 95000, 55000]);
  ws.addRow(['Q2 2026', 220000, 110000, 110000]);
  return await wb.xlsx.writeBuffer();
}

async function generateSamplePptx() {
  const pptx = new PptxGenJS();
  const slide1 = pptx.addSlide();
  slide1.addText('Executive Overview', { x: 1, y: 1, fontSize: 24, bold: true });
  slide1.addText('• Key Performance Metrics', { x: 1, y: 2, fontSize: 16 });
  slide1.addText('• Strategic Deliverables for Q4', { x: 1, y: 2.6, fontSize: 16 });
  return await pptx.write({ outputType: 'nodebuffer' });
}

async function generateSampleJpg() {
  return await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 50, g: 120, b: 240 }
    }
  }).jpeg().toBuffer();
}

async function testEndpoint(name, endpoint, fileBuffer, fileName, mimeType, formExtra = {}) {
  try {
    const formData = new FormData();
    const file = new File([fileBuffer], fileName, { type: mimeType });
    formData.append('file', file);
    formData.append('files', file);

    for (const [k, v] of Object.entries(formExtra)) {
      formData.append(k, v);
    }

    const res = await fetch(`${BASE}${endpoint}`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`❌ ${name} failed [HTTP ${res.status}]:`, errText.slice(0, 200));
      return false;
    }

    const ct = res.headers.get('content-type') || '';
    const cd = res.headers.get('content-disposition') || '';
    const ab = await res.arrayBuffer();

    console.log(`✅ ${name}: SUCCESS (${ab.byteLength} bytes)`);
    console.log(`   Content-Type: ${ct}`);
    console.log(`   Content-Disposition: ${cd}`);
    return true;
  } catch (err) {
    console.log(`❌ ${name} exception:`, err.message);
    return false;
  }
}

async function run() {
  console.log('Generating test samples...');
  const pdfBytes = await generateSamplePdf();
  const docxBytes = await generateSampleDocx();
  const xlsxBytes = await generateSampleXlsx();
  const pptxBytes = await generateSamplePptx();
  const jpgBytes = await generateSampleJpg();

  console.log('\n--- TESTING PDF ↔ OFFICE CONVERSIONS ---');
  await testEndpoint('PDF → Word (DOCX)', '/api/pdf/pdf-to-word', pdfBytes, 'sample.pdf', 'application/pdf');
  await testEndpoint('Word (DOCX) → PDF', '/api/pdf/word-to-pdf', docxBytes, 'sample.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  await testEndpoint('PDF → Excel (XLSX)', '/api/pdf/pdf-to-excel', pdfBytes, 'sample.pdf', 'application/pdf');
  await testEndpoint('Excel (XLSX) → PDF', '/api/pdf/excel-to-pdf', xlsxBytes, 'sample.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await testEndpoint('PDF → PowerPoint (PPTX)', '/api/pdf/pdf-to-powerpoint', pdfBytes, 'sample.pdf', 'application/pdf');
  await testEndpoint('PowerPoint (PPTX) → PDF', '/api/pdf/powerpoint-to-pdf', pptxBytes, 'sample.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

  console.log('\n--- TESTING IMAGE & UTILITY CONVERSIONS ---');
  await testEndpoint('PDF → Image (ZIP)', '/api/pdf/to-image', pdfBytes, 'sample.pdf', 'application/pdf');
  await testEndpoint('Image (JPG) → PDF', '/api/pdf/from-image', jpgBytes, 'sample.jpg', 'image/jpeg');
  await testEndpoint('PDF → Text (TXT)', '/api/pdf/extract-text', pdfBytes, 'sample.pdf', 'application/pdf');
  await testEndpoint('PDF Rotate', '/api/pdf/rotate', pdfBytes, 'sample.pdf', 'application/pdf', { rotation: '90', pages: 'all' });
  await testEndpoint('PDF Page Numbers', '/api/pdf/page-numbers', pdfBytes, 'sample.pdf', 'application/pdf');
  await testEndpoint('PDF Watermark', '/api/pdf/watermark', pdfBytes, 'sample.pdf', 'application/pdf', { text: 'SAMPLE WATERMARK' });

  console.log('\nAll tests complete.');
}

run();

/**
 * Sign PDF — apply a signature image to a page.
 *
 * HONEST NOTE: True PDF digital signatures (RFC 8017 PKCS#7) require
 * cryptographic infrastructure (OpenSSL, a key store, a timestamp
 * authority) that Vercel's serverless runtime does not provide.
 *
 * What we CAN do honestly is overlay a signature image (a drawn
 * signature or a typed name) on a chosen page. This is a *visual*
 * signature — not a cryptographically-verifiable digital signature.
 * The UI should make this distinction explicit; this route's
 * response includes a `kind: 'visual'` marker so clients can label
 * the output accordingly.
 */
import { NextRequest } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  withErrorHandler,
  requiredFile,
  RouteError,
  fileToBytes,
  downloadResponse,
} from '../_shared/pdf-pipeline';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = withErrorHandler(async (req: NextRequest) => {
  const formData = await req.formData();
  const file = requiredFile(formData, 'file');
  const signature = (formData.get('signature') as string) || '';
  const typedName = (formData.get('typedName') as string) || '';
  const pageStr = (formData.get('page') as string) || 'last';
  const xPct = Math.min(0.95, Math.max(0, parseFloat((formData.get('x') as string) || '0.7')));
  const yPct = Math.min(0.95, Math.max(0, parseFloat((formData.get('y') as string) || '0.1')));

  if (!signature && !typedName) {
    throw new RouteError('Provide a signature image or a typed name.', 400, 'missing_signature');
  }

  const bytes = await fileToBytes(file);
  const pdf = await PDFDocument.load(bytes).catch(() => {
    throw new RouteError('PDF is invalid or corrupted.', 415, 'corrupt_pdf');
  });
  const pages = pdf.getPages();
  if (pages.length === 0) throw new RouteError('PDF has no pages.', 422, 'empty_pdf');

  const targetIdx = pageStr === 'last'
    ? pages.length - 1
    : pageStr === 'first'
      ? 0
      : Math.max(0, Math.min(pages.length - 1, parseInt(pageStr, 10) - 1));
  if (Number.isNaN(targetIdx)) {
    throw new RouteError('Invalid page reference.', 400, 'invalid_page');
  }
  const target = pages[targetIdx];
  const { width: pw, height: ph } = target.getSize();

  let drawn = false;
  if (signature) {
    // signature is a data URL: data:image/png;base64,...
    const m = signature.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
    if (!m) throw new RouteError('Signature must be a PNG/JPEG data URL.', 400, 'invalid_signature');
    const ext = m[1] === 'jpeg' || m[1] === 'jpg' ? 'jpg' : 'png';
    const bytes2 = Buffer.from(m[2], 'base64');
    const img = ext === 'jpg' ? await pdf.embedJpg(bytes2) : await pdf.embedPng(bytes2);
    const sigW = Math.min(pw * 0.4, img.width);
    const sigH = sigW * (img.height / img.width);
    target.drawImage(img, {
      x: pw * xPct,
      y: ph * yPct,
      width: sigW,
      height: sigH,
    });
    drawn = true;
  } else if (typedName) {
    const font = await pdf.embedFont(StandardFonts.HelveticaOblique);
    const fontSize = 18;
    const textW = font.widthOfTextAtSize(typedName, fontSize);
    // A handwritten-feel underline.
    target.drawText(typedName, {
      x: pw * xPct,
      y: ph * yPct + 6,
      size: fontSize,
      font,
      color: rgb(0.05, 0.05, 0.6),
    });
    target.drawLine({
      start: { x: pw * xPct, y: ph * yPct + 4 },
      end: { x: pw * xPct + textW, y: ph * yPct + 4 },
      thickness: 1,
      color: rgb(0.05, 0.05, 0.6),
    });
    drawn = true;
  }
  if (!drawn) throw new RouteError('Failed to place signature.', 500, 'placement_failed');

  const out = await pdf.save();
  return downloadResponse(out, `signed-visual-${Date.now()}.pdf`, 'application/pdf');
});

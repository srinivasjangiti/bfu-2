/**
 * Protect PDF — encrypt with a password.
 *
 * Implements standard 128-bit RC4 PDF encryption via @pdfsmaller/pdf-encrypt-lite.
 * Compatible with all standard PDF readers (Adobe Acrobat, Chrome, Preview, etc.).
 */
import { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';
import { encryptPDF } from '@pdfsmaller/pdf-encrypt-lite';
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
  const password = formData.get('password');

  if (typeof password !== 'string' || password.trim().length === 0) {
    throw new RouteError('A password is required to protect the document.', 400, 'missing_password');
  }

  const bytes = await fileToBytes(file);

  // Validate that the uploaded file is a valid PDF
  try {
    await PDFDocument.load(bytes);
  } catch (err) {
    throw new RouteError('PDF is invalid or corrupted.', 415, 'corrupt_pdf');
  }

  // Encrypt the PDF using standard 128-bit encryption
  let encryptedBytes: Uint8Array;
  try {
    encryptedBytes = await encryptPDF(bytes, password.trim());
  } catch (err) {
    console.error('[protect-pdf] Encryption error:', err);
    throw new RouteError('Failed to encrypt PDF: ' + ((err as Error)?.message || 'unknown error'), 500, 'encryption_failed');
  }

  return downloadResponse(encryptedBytes, `protected-${Date.now()}.pdf`, 'application/pdf');
});

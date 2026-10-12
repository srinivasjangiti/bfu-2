/**
 * Unlock PDF — remove a user-known password from an encrypted PDF.
 *
 * Uses MuPDF WebAssembly engine to verify the user-supplied password
 * and save a decrypted version with password protection removed.
 */
import { NextRequest } from 'next/server';
import * as mupdf from 'mupdf';
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

  if (typeof password !== 'string' || password.length === 0) {
    throw new RouteError('Please provide the password to unlock this document.', 400, 'missing_password');
  }

  const bytes = await fileToBytes(file);

  let doc: any;
  try {
    doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  } catch (err) {
    throw new RouteError('The provided file is not a valid PDF or is severely corrupted.', 415, 'corrupt_pdf');
  }

  try {
    if (!doc.needsPassword()) {
      throw new RouteError('This PDF document is not password-protected.', 400, 'not_encrypted');
    }

    const authResult = doc.authenticatePassword(password);
    if (authResult === 0) {
      throw new RouteError('Incorrect password provided.', 401, 'invalid_password');
    }

    // Save with encrypt=none to produce an unencrypted PDF
    const saved = doc.saveToBuffer('encrypt=none');
    const unlockedBytes = saved.asUint8Array();

    return downloadResponse(unlockedBytes, `unlocked-${Date.now()}.pdf`, 'application/pdf');
  } finally {
    try {
      doc.destroy();
    } catch {
      // Ignore destruction error
    }
  }
});

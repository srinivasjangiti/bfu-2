/**
 * Repair PDF — best-effort structural repair.
 *
 * HONEST NOTE: There is no general-purpose PDF repair tool in pure JS
 * for Vercel. What we CAN do is re-serialise the file through pdf-lib,
 * which sometimes fixes minor structural problems (missing xref
 * trailer, etc.) by re-emitting the object table. We try this first;
 * if pdf-lib can't even parse the file, we report the corruption and
 * suggest the user try a real repair tool (qpdf, mutool, Adobe Acrobat).
 */
import { NextRequest } from 'next/server';
import { PDFDocument } from 'pdf-lib';
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
  const bytes = await fileToBytes(file);

  let pdf: PDFDocument;
  try {
    // `ignoreEncryption: true` lets us at least re-serialise files that
    // we can't open for content; this isn't a decrypt, but it sometimes
    // rescues a file whose xref table is malformed.
    pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      updateMetadata: false,
    });
  } catch (e) {
    throw new RouteError(
      'PDF is too damaged to repair automatically. Try a real repair tool (Adobe Acrobat, mutool clean, qpdf --qdf).',
      415,
      'corrupt_pdf',
    );
  }

  if (pdf.getPageCount() === 0) {
    throw new RouteError('PDF has no pages after repair attempt.', 422, 'empty_pdf');
  }

  // Re-emit: forces a new xref and trailer.
  const out = await pdf.save({ useObjectStreams: false });
  return downloadResponse(out, `repaired-${Date.now()}.pdf`, 'application/pdf');
});

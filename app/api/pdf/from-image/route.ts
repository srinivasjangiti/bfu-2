import { NextRequest, NextResponse } from 'next/server';
import { pdfEngine } from '@/lib/pdf-engine/engine';
import { validateImageFiles } from '@/lib/pdf-engine/validators/image';
import { engineResultToResponse, handleEngineError } from '../_shared/engine-response';
import { UploadedFile, ImageOptions, PDFLogger } from '@/lib/pdf-engine/types';

const consoleLogger: PDFLogger = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    let rawFiles = formData.getAll('files') as File[];
    if (rawFiles.length === 0) {
      const single = formData.get('file');
      if (single instanceof File) {
        rawFiles = [single];
      }
    }
    const pageSize = formData.get('pageSize') as string || 'A4';
    const format = pageSize.toLowerCase() === 'letter' ? 'Letter' : 'A4';

    // 1. Convert File[] to UploadedFile[]
    const files: UploadedFile[] = [];
    for (const rf of rawFiles) {
      if (!(rf instanceof File)) continue;
      const arrayBuffer = await rf.arrayBuffer();
      files.push({
        name: rf.name,
        mimeType: rf.type,
        size: rf.size,
        buffer: new Uint8Array(arrayBuffer),
      });
    }

    // 2. Validate
    validateImageFiles(files);

    // 3. Execute
    const result = await pdfEngine.imageToPdf({
      requestId: crypto.randomUUID(),
      files,
      options: { format: format as ImageOptions['format'] },
      logger: consoleLogger,
    });

    // 4. Respond
    return engineResultToResponse(result);
  } catch (error) {
    return handleEngineError(error);
  }
}

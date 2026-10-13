import { NextRequest, NextResponse } from 'next/server';
import { pdfEngine } from '@/lib/pdf-engine/engine';
import { validateMergeFiles } from '@/lib/pdf-engine/validators/merge';
import { engineResultToResponse, handleEngineError } from '../_shared/engine-response';
import { UploadedFile, MergeOptions, PDFLogger } from '@/lib/pdf-engine/types';

// Simple logger adapter for Next.js
const consoleLogger: PDFLogger = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

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

    // Extract options
    const sortType = (formData.get('sortType') as MergeOptions['sortType']) || 'orderProvided';

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
    validateMergeFiles(files);

    // 3. Execute
    const result = await pdfEngine.merge({
      requestId: crypto.randomUUID(),
      files,
      options: { sortType },
      logger: consoleLogger,
    });

    // 4. Respond
    return engineResultToResponse(result);
  } catch (error) {
    return handleEngineError(error);
  }
}

// Document parsing utilities for PDF, DOCX, and TXT files

import mammoth from 'mammoth';

export class DocumentParser {
  /**
   * Parse document based on file type
   */
  static async parse(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const fileType = file.type;

    if (fileType === 'application/pdf') {
      return this.parsePDF(Buffer.from(buffer));
    } else if (
      fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileType === 'application/msword'
    ) {
      return this.parseDOCX(Buffer.from(buffer));
    } else if (fileType === 'text/plain') {
      return this.parseTXT(Buffer.from(buffer));
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  /**
   * Parse PDF document
   */
  private static async parsePDF(buffer: Buffer): Promise<string> {
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    // 1. Try modern pdf-parse (v2+ PDFParse class)
    try {
      const pdfParseModule = await import('pdf-parse');
      // @ts-ignore - pdf-parse v2 exposes PDFParse class
      if (typeof pdfParseModule.PDFParse === 'function') {
        const parser = new (pdfParseModule.PDFParse as any)(uint8);
        if (typeof parser.load === 'function') {
          await parser.load();
        }
        const res = await parser.getText();
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
        const text = typeof res === 'string' ? res : res?.text;
        if (typeof text === 'string' && text.trim().length > 0) {
          return text;
        }
      }

      // @ts-ignore - pdf-parse v1 exposes a default callable function
      const pdf = pdfParseModule.default || pdfParseModule;
      if (typeof pdf === 'function') {
        const data = await pdf(buffer);
        if (data?.text) return data.text;
      }
    } catch (primaryErr) {
      console.warn('[DocumentParser] pdf-parse attempt failed, falling back to pdfjs-dist:', primaryErr);
    }

    // 2. Direct pdfjs-dist fallback
    try {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const doc = await pdfjs.getDocument({
        data: uint8,
        isEvalSupported: false,
        disableFontFace: true,
      }).promise;

      const pageTexts: string[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const lines: string[] = [];
        let currentLine = '';
        let lastY: number | null = null;
        for (const item of tc.items as Array<{ str?: string; transform?: number[] }>) {
          if (!item || typeof item.str !== 'string') continue;
          const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : null;
          if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
            if (currentLine.trim()) lines.push(currentLine.trim());
            currentLine = item.str;
          } else {
            currentLine += (currentLine ? ' ' : '') + item.str;
          }
          lastY = y;
        }
        if (currentLine.trim()) lines.push(currentLine.trim());
        pageTexts.push(lines.join('\n'));
      }
      return pageTexts.join('\n\n\f\n\n');
    } catch (fallbackErr) {
      throw new Error(`Failed to parse PDF: ${fallbackErr instanceof Error ? fallbackErr.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse DOCX document
   */
  private static async parseDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse plain text document
   */
  private static parseTXT(buffer: Buffer): Promise<string> {
    try {
      return Promise.resolve(buffer.toString('utf-8'));
    } catch (error) {
      throw new Error(`Failed to parse TXT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate file size
   */
  static validateFileSize(file: File, maxSizeInBytes: number = 10 * 1024 * 1024): boolean {
    return file.size <= maxSizeInBytes;
  }

  /**
   * Validate file type
   */
  static validateFileType(file: File): boolean {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    return allowedTypes.includes(file.type);
  }
}

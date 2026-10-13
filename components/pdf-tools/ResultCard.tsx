import { Download, RefreshCcw, ArrowLeft, CheckCircle } from 'lucide-react';
import { PDFTool } from './data';
import { safeDownload } from '@/lib/download-utils';

interface ResultCardProps {
  tool: PDFTool;
  blob: Blob;
  serverFilename?: string;
  onReset: () => void;
  onProcessAnother: () => void;
}

export function resolveDownloadFilename(tool: PDFTool, blob: Blob, serverFilename?: string): string {
  if (serverFilename && serverFilename.includes('.')) {
    return serverFilename;
  }

  let ext = 'pdf';
  const expected = (tool.metadata?.expectedOutput || '').toUpperCase();
  const toolId = tool.id.toLowerCase();

  if (expected.includes('DOCX') || toolId.includes('to-word')) {
    ext = 'docx';
  } else if (expected.includes('XLSX') || toolId.includes('to-excel')) {
    ext = 'xlsx';
  } else if (expected.includes('PPTX') || toolId.includes('to-powerpoint')) {
    ext = 'pptx';
  } else if (expected.includes('ZIP') || toolId.includes('to-jpg') || toolId.includes('extract-images')) {
    ext = 'zip';
  } else if (expected.includes('TXT') || toolId.includes('extract-text') || toolId.includes('ocr')) {
    ext = 'txt';
  } else if (blob.type) {
    if (blob.type.includes('wordprocessingml')) ext = 'docx';
    else if (blob.type.includes('spreadsheetml')) ext = 'xlsx';
    else if (blob.type.includes('presentationml')) ext = 'pptx';
    else if (blob.type.includes('zip')) ext = 'zip';
    else if (blob.type.includes('text/plain')) ext = 'txt';
    else if (blob.type.includes('pdf')) ext = 'pdf';
  }

  const prefix = tool.capabilities?.api?.downloadFilenamePrefix || 'converted';
  return `${prefix}-${Date.now()}.${ext}`;
}

export function ResultCard({ tool, blob, serverFilename, onReset, onProcessAnother }: ResultCardProps) {
  const resolvedFilename = resolveDownloadFilename(tool, blob, serverFilename);

  const handleDownload = () => {
    safeDownload(blob, resolvedFilename);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="bg-white border-2 border-green-200 rounded-xl p-12 text-center max-w-2xl mx-auto shadow-sm animate-in fade-in zoom-in duration-300">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>
      
      <h3 className="text-2xl font-bold text-stone-900 mb-2">Success!</h3>
      <p className="text-stone-600 mb-2 font-medium">
        Your file has been successfully converted to <span className="font-bold text-stone-900">{tool.metadata.expectedOutput || 'document'}</span>.
      </p>
      <div className="inline-flex items-center gap-2 bg-stone-100 border border-stone-200 px-3 py-1 rounded-full text-xs font-mono text-stone-700 mb-6">
        <span>📄 {resolvedFilename}</span>
        <span className="text-stone-400">•</span>
        <span>{formatSize(blob.size)}</span>
      </div>

      <div className="flex flex-col gap-4 max-w-sm mx-auto">
        <button 
          onClick={handleDownload}
          className="flex items-center justify-center gap-2 w-full py-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold text-lg shadow-md hover:shadow-lg transition-all active:scale-95"
        >
          <Download className="w-5 h-5" />
          Download File
        </button>

        <div className="grid grid-cols-2 gap-4 mt-2">
          <button 
            onClick={onProcessAnother}
            className="flex items-center justify-center gap-2 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-semibold transition-all"
          >
            <RefreshCcw className="w-4 h-4" />
            Restart Tool
          </button>
          
          <button 
            onClick={onReset}
            className="flex items-center justify-center gap-2 py-3 bg-white border-2 border-stone-200 hover:border-stone-400 text-stone-700 rounded-xl font-semibold transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            All Tools
          </button>
        </div>
      </div>
    </div>
  );
}

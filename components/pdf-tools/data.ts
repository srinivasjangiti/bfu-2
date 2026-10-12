import {
  FileText, Scissors, Merge, Minimize2, FileType, Image, Shield, Lock, Unlock, RotateCw, Layers, Hash, Edit3, Download, Upload, Check, Droplet, Grid3x3, Eye, Settings, Zap, Sparkles, FileImage, FileCode, Wrench, ScanText, FileCheck, Loader2, Star, X, Type, Palette, ArrowRight, Clock, LucideIcon
} from 'lucide-react';

export type ToolCategory = 'convert' | 'organize' | 'optimize' | 'edit' | 'security';
export type WorkflowStep = 'choose' | 'upload' | 'configure' | 'process' | 'result';

export interface PDFToolOption {
  id: string;
  type: 'text' | 'select' | 'number';
  label: string;
  defaultValue?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface PDFTool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  popular?: boolean;
  premium?: boolean;
  comingSoon?: boolean;
  metadata: {
    title: string;
    description: string;
    supportedInput: string;
    expectedOutput: string;
    estimatedTime: string;
    ctaText: string;
  };
  capabilities?: {
    upload: {
      multiple: boolean;
      mime: string[];
      maxSizeMB: number;
    };
    options?: PDFToolOption[];
    api?: {
      endpoint: string;
      method: 'POST' | 'GET';
      responseType: 'blob' | 'json';
      downloadFilenamePrefix: string;
    };
  };
}

export const CATEGORIES = [
  { id: 'convert', name: 'Convert PDF' },
  { id: 'organize', name: 'Organize PDF' },
  { id: 'optimize', name: 'Optimize PDF' },
  { id: 'edit', name: 'Edit PDF' },
  { id: 'security', name: 'PDF Security' }
];

export const TOOLS: PDFTool[] = [
  // --- CONVERT TOOLS ---
  {
    id: 'jpg-to-pdf',
    name: 'JPG to PDF',
    description: 'Convert images to PDF documents',
    icon: FileImage,
    category: 'convert',
    popular: true,
    metadata: {
      title: 'Upload Images',
      description: 'Combine multiple JPG or PNG images into a single PDF document.',
      supportedInput: 'JPG, PNG',
      expectedOutput: 'PDF',
      estimatedTime: '1–3 seconds',
      ctaText: 'Convert to PDF'
    },
    capabilities: {
      upload: { multiple: true, mime: ['image/jpeg', 'image/png'], maxSizeMB: 50 },
      options: [
        { id: 'pageSize', type: 'select', label: 'Page Size', defaultValue: 'A4', options: [{value: 'A4', label: 'A4'}, {value: 'Letter', label: 'US Letter'}] }
      ],
      api: { endpoint: '/api/pdf/from-image', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'images-to-pdf' }
    }
  },
  { id: 'pdf-to-word', name: 'PDF to Word', description: 'Convert PDF to editable Word documents', icon: FileType, category: 'convert', popular: true, metadata: { title: 'Upload PDF', description: 'Convert PDF documents into editable DOCX files. Headings are inferred from caps/labels; complex layouts are simplified.', supportedInput: 'PDF', expectedOutput: 'DOCX', estimatedTime: '2–5 seconds', ctaText: 'Convert to Word' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'pageBreaks', type: 'select', label: 'Page Breaks', defaultValue: 'true', options: [{ value: 'true', label: 'Preserve page breaks' }, { value: 'false', label: 'Continuous flow' }] }
      ],
      api: { endpoint: '/api/pdf/pdf-to-word', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'converted' }
    }
  },
  { id: 'word-to-pdf', name: 'Word to PDF', description: 'Convert Word documents to PDF format', icon: FileText, category: 'convert', popular: true, metadata: { title: 'Upload Word Document', description: 'Convert Word documents (DOCX) into a printable PDF. Layout is text-based; complex Word formatting is simplified.', supportedInput: 'DOCX', expectedOutput: 'PDF', estimatedTime: '2–5 seconds', ctaText: 'Convert to PDF' },
    capabilities: {
      upload: { multiple: false, mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxSizeMB: 50 },
      api: { endpoint: '/api/pdf/word-to-pdf', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'converted' }
    }
  },
  { id: 'pdf-to-excel', name: 'PDF to Excel', description: 'Extract tables from PDF to Excel spreadsheets', icon: Grid3x3, category: 'convert', metadata: { title: 'Upload PDF', description: 'Extract positional data and full text into an XLSX with one or more sheets. Best-effort: complex tables may be split across rows.', supportedInput: 'PDF', expectedOutput: 'XLSX', estimatedTime: '5–10 seconds', ctaText: 'Convert to Excel' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      api: { endpoint: '/api/pdf/pdf-to-excel', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'extracted' }
    }
  },
  { id: 'excel-to-pdf', name: 'Excel to PDF', description: 'Convert Excel spreadsheets to PDF', icon: FileCode, category: 'convert', metadata: { title: 'Upload Excel Spreadsheet', description: 'Render each sheet into a paginated PDF table. Charts and conditional formatting are not preserved.', supportedInput: 'XLSX', expectedOutput: 'PDF', estimatedTime: '3–6 seconds', ctaText: 'Convert to PDF' },
    capabilities: {
      upload: { multiple: false, mime: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], maxSizeMB: 50 },
      options: [
        { id: 'maxRows', type: 'text', label: 'Max rows per sheet (1–5000)', defaultValue: '1000' }
      ],
      api: { endpoint: '/api/pdf/excel-to-pdf', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'spreadsheet' }
    }
  },
  { id: 'pdf-to-powerpoint', name: 'PDF to PowerPoint', description: 'Convert PDF to editable presentations', icon: Layers, category: 'convert', metadata: { title: 'Upload PDF', description: 'Each PDF page becomes a slide rendered as a high-res image. Editable in PowerPoint/Keynote.', supportedInput: 'PDF', expectedOutput: 'PPTX', estimatedTime: '5–15 seconds', ctaText: 'Convert to PowerPoint' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      api: { endpoint: '/api/pdf/pdf-to-powerpoint', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'converted' }
    }
  },
  { id: 'powerpoint-to-pdf', name: 'PowerPoint to PDF', description: 'Convert presentations to PDF format', icon: FileText, category: 'convert', metadata: { title: 'Upload PowerPoint Presentation', description: 'Convert each slide into a PDF page containing its text. Layout/themes/animations are simplified.', supportedInput: 'PPTX', expectedOutput: 'PDF', estimatedTime: '3–6 seconds', ctaText: 'Convert to PDF' },
    capabilities: {
      upload: { multiple: false, mime: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], maxSizeMB: 50 },
      api: { endpoint: '/api/pdf/powerpoint-to-pdf', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'slides' }
    }
  },
  { id: 'pdf-to-jpg', name: 'PDF to JPG', description: 'Convert PDF pages to JPG images', icon: Image, category: 'convert', popular: true, metadata: { title: 'Upload PDF', description: 'Render each PDF page to a high-quality image and bundle them in a single ZIP download.', supportedInput: 'PDF', expectedOutput: 'JPG (ZIP)', estimatedTime: '2–4 seconds', ctaText: 'Convert to JPG' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'format', type: 'select', label: 'Image Format', defaultValue: 'jpeg', options: [{ value: 'jpeg', label: 'JPEG (smaller)' }, { value: 'png', label: 'PNG (lossless)' }, { value: 'webp', label: 'WebP' }] },
        { id: 'quality', type: 'text', label: 'JPEG Quality (1–100)', defaultValue: '85' },
        { id: 'scale', type: 'text', label: 'Render Scale (0.5–3.0)', defaultValue: '2' }
      ],
      api: { endpoint: '/api/pdf/to-image', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'pdf-pages' }
    }
  },

  // --- ORGANIZE TOOLS ---
  {
    id: 'merge-pdf',
    name: 'Merge PDF',
    description: 'Combine multiple PDFs into a single document (Note: Drops Forms & Bookmarks)',
    icon: Merge,
    category: 'organize',
    popular: true,
    metadata: {
      title: 'Upload Multiple PDFs',
      description: 'Merge multiple PDF files into one combined document. Note: Interactive forms and bookmarks are currently dropped.',
      supportedInput: 'Multiple PDFs',
      expectedOutput: 'PDF',
      estimatedTime: '1–3 seconds',
      ctaText: 'Merge PDFs'
    },
    capabilities: {
      upload: { multiple: true, mime: ['application/pdf'], maxSizeMB: 50 },
      api: { endpoint: '/api/pdf/merge', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'merged' }
    }
  },
  {
    id: 'split-pdf',
    name: 'Split PDF',
    description: 'Separate one page or a whole set for easy conversion',
    icon: Scissors,
    category: 'organize',
    popular: true,
    metadata: {
      title: 'Upload PDF to Split',
      description: 'Extract specific pages or split a document into multiple files.',
      supportedInput: 'PDF',
      expectedOutput: 'PDF',
      estimatedTime: '2–4 seconds',
      ctaText: 'Split PDF'
    },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'pages', type: 'text', label: 'Page Ranges to Extract', placeholder: 'e.g. 1-3, 5' }
      ],
      api: { endpoint: '/api/pdf/split', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'split' }
    }
  },
  {
    id: 'rotate-pdf',
    name: 'Rotate PDF',
    description: 'Rotate your PDFs the way you need them',
    icon: RotateCw,
    category: 'organize',
    metadata: {
      title: 'Upload PDF to Rotate',
      description: 'Rotate specific pages or the entire document by 90, 180, or 270 degrees.',
      supportedInput: 'PDF',
      expectedOutput: 'PDF',
      estimatedTime: '1–2 seconds',
      ctaText: 'Rotate PDF'
    },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'rotation', type: 'select', label: 'Rotation Angle', defaultValue: '90', options: [{value: '90', label: '90 Degrees Clockwise'}, {value: '180', label: '180 Degrees'}, {value: '270', label: '90 Degrees Counter-Clockwise'}] },
        { id: 'pages', type: 'text', label: 'Pages to Rotate', defaultValue: 'all', placeholder: 'e.g. all, 1, 3-5' }
      ],
      api: { endpoint: '/api/pdf/rotate', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'rotated' }
    }
  },
  { id: 'page-numbers', name: 'Page Numbers', description: 'Add page numbers into PDFs with ease', icon: Hash, category: 'organize', metadata: { title: 'Upload PDF', description: 'Insert customizable page numbers into your PDF document.', supportedInput: 'PDF', expectedOutput: 'PDF', estimatedTime: '1–3 seconds', ctaText: 'Add Page Numbers' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'position', type: 'select', label: 'Position', defaultValue: 'bottom-center', options: [
          { value: 'bottom-center', label: 'Bottom Center' }, { value: 'bottom-right', label: 'Bottom Right' }, { value: 'bottom-left', label: 'Bottom Left' },
          { value: 'top-center', label: 'Top Center' }, { value: 'top-right', label: 'Top Right' }, { value: 'top-left', label: 'Top Left' }
        ]},
        { id: 'format', type: 'text', label: 'Format', defaultValue: 'Page {n} of {total}' },
        { id: 'fontSize', type: 'text', label: 'Font Size (1–72)', defaultValue: '10' },
        { id: 'startFrom', type: 'text', label: 'Start From', defaultValue: '1' },
        { id: 'color', type: 'text', label: 'Color (hex)', defaultValue: '#333333' },
        { id: 'pages', type: 'text', label: 'Pages (e.g. all, 1-3, 5)', defaultValue: 'all' }
      ],
      api: { endpoint: '/api/pdf/page-numbers', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'numbered' }
    }
  },

  // --- OPTIMIZE TOOLS ---
  {
    id: 'compress-pdf',
    name: 'Optimize PDF (Lossless)',
    description: 'Perform structural optimization without quality loss (typically ~5% savings)',
    icon: Minimize2,
    category: 'optimize',
    popular: true,
    metadata: {
      title: 'Upload PDF to Optimize',
      description: 'Losslessly optimize the PDF structure (Note: This does not downsample images).',
      supportedInput: 'PDF',
      expectedOutput: 'PDF (Optimized)',
      estimatedTime: '3–8 seconds',
      ctaText: 'Optimize PDF'
    },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 100 },
      api: { endpoint: '/api/pdf/compress', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'optimized' }
    }
  },
  { id: 'repair-pdf', name: 'Repair PDF', description: 'Fix corrupted or damaged PDF files', icon: Wrench, category: 'optimize', metadata: { title: 'Upload Corrupted PDF', description: 'Best-effort structural repair: re-emits the PDF object table. Severely damaged files may not be recoverable — the route will report the failure honestly.', supportedInput: 'PDF', expectedOutput: 'PDF', estimatedTime: '5–15 seconds', ctaText: 'Repair PDF' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      api: { endpoint: '/api/pdf/repair', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'repaired' }
    }
  },
  { id: 'ocr-pdf', name: 'OCR PDF', description: 'Extract text from scanned documents using Tesseract OCR', icon: ScanText, category: 'optimize', popular: true, metadata: { title: 'Upload Scanned PDF', description: 'Extract readable text from image-only and scanned PDFs using Tesseract OCR engine.', supportedInput: 'PDF (Scanned)', expectedOutput: 'TXT', estimatedTime: '5–15 seconds', ctaText: 'Extract with OCR' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'language', type: 'select', label: 'Recognition Language', defaultValue: 'eng', options: [{ value: 'eng', label: 'English' }, { value: 'spa', label: 'Spanish' }, { value: 'fra', label: 'French' }, { value: 'deu', label: 'German' }] }
      ],
      api: { endpoint: '/api/pdf/ocr', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'ocr-extracted' }
    }
  },

  // --- EDIT TOOLS ---
  { id: 'edit-pdf', name: 'Edit PDF', description: 'Add text, images, and shapes to PDF', icon: Edit3, category: 'edit', premium: true, comingSoon: true, metadata: { title: 'Upload PDF to Edit', description: 'Visual WYSIWYG editing requires an interactive design canvas. See release notes for desktop roadmap.', supportedInput: 'PDF', expectedOutput: 'PDF', estimatedTime: 'N/A', ctaText: 'Open Editor (unavailable)' } },
  { id: 'watermark-pdf', name: 'Watermark PDF', description: 'Add watermark to protect your documents', icon: Droplet, category: 'edit', metadata: { title: 'Upload PDF', description: 'Overlay a configurable text watermark (opacity, rotation, position) onto your PDF pages.', supportedInput: 'PDF', expectedOutput: 'PDF', estimatedTime: '2–4 seconds', ctaText: 'Add Watermark' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'text', type: 'text', label: 'Watermark Text', defaultValue: 'CONFIDENTIAL' },
        { id: 'fontSize', type: 'text', label: 'Font Size (1–500)', defaultValue: '48' },
        { id: 'opacity', type: 'text', label: 'Opacity (0.05–1)', defaultValue: '0.15' },
        { id: 'rotation', type: 'text', label: 'Rotation (degrees)', defaultValue: '-30' },
        { id: 'color', type: 'text', label: 'Color (hex)', defaultValue: '#888888' },
        { id: 'pages', type: 'text', label: 'Pages (e.g. all, 1-3)', defaultValue: 'all' }
      ],
      api: { endpoint: '/api/pdf/watermark', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'watermarked' }
    }
  },
  { id: 'sign-pdf', name: 'Sign PDF', description: 'Add signature to PDF documents', icon: Edit3, category: 'edit', popular: true, metadata: { title: 'Upload PDF to Sign', description: 'Place a visual signature (drawn image or typed name) on a chosen page. NOT a cryptographic digital signature.', supportedInput: 'PDF', expectedOutput: 'PDF (Visually Signed)', estimatedTime: '2–4 seconds', ctaText: 'Sign Document' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'page', type: 'text', label: 'Page (1, 2, "last", "first")', defaultValue: 'last' },
        { id: 'typedName', type: 'text', label: 'Or type a name to sign with', defaultValue: '' }
      ],
      api: { endpoint: '/api/pdf/sign', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'signed-visual' }
    }
  },
  { id: 'extract-images', name: 'Extract Images', description: 'Extract all images from PDF', icon: Image, category: 'edit', metadata: { title: 'Upload PDF', description: 'Extract embedded raster images and bundle them in a single ZIP. Vector-only PDFs report a clear error.', supportedInput: 'PDF', expectedOutput: 'Images (ZIP)', estimatedTime: '3–6 seconds', ctaText: 'Extract Images' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      api: { endpoint: '/api/pdf/extract-images', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'extracted-images' }
    }
  },
  { id: 'extract-text', name: 'Extract Text', description: 'Extract raw text from PDF documents', icon: FileText, category: 'edit', metadata: { title: 'Upload PDF', description: 'Extract the PDF text in reading order and download as a .txt file.', supportedInput: 'PDF', expectedOutput: 'TXT', estimatedTime: '2–5 seconds', ctaText: 'Extract Text' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      api: { endpoint: '/api/pdf/extract-text', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'extracted' }
    }
  },

  // --- SECURITY TOOLS ---
  { id: 'protect-pdf', name: 'Protect PDF', description: 'Encrypt your PDF with a password', icon: Lock, category: 'security', popular: true, metadata: { title: 'Upload PDF to Protect', description: 'Encrypt your PDF with standard 128-bit encryption to require a password before viewing.', supportedInput: 'PDF', expectedOutput: 'PDF (Encrypted)', estimatedTime: '1–3 seconds', ctaText: 'Encrypt PDF' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'password', type: 'text', label: 'Password to protect with', placeholder: 'Enter strong password' }
      ],
      api: { endpoint: '/api/pdf/protect', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'protected' }
    }
  },
  { id: 'unlock-pdf', name: 'Unlock PDF', description: 'Remove password from PDF files', icon: Unlock, category: 'security', popular: true, metadata: { title: 'Upload Encrypted PDF', description: 'Provide the document password to decrypt the PDF and remove password protection permanently.', supportedInput: 'PDF (Encrypted)', expectedOutput: 'PDF (Unlocked)', estimatedTime: '1–3 seconds', ctaText: 'Unlock PDF' },
    capabilities: {
      upload: { multiple: false, mime: ['application/pdf'], maxSizeMB: 50 },
      options: [
        { id: 'password', type: 'text', label: 'Current Document Password', placeholder: 'Enter document password' }
      ],
      api: { endpoint: '/api/pdf/unlock', method: 'POST', responseType: 'blob', downloadFilenamePrefix: 'unlocked' }
    }
  },
  { id: 'redact-pdf', name: 'Redact PDF', description: 'Permanently remove sensitive information', icon: Shield, category: 'security', premium: true, comingSoon: true, metadata: { title: 'Upload PDF to Redact', description: 'True redaction requires removing content streams from the underlying PDF. Interactive redaction is planned for the desktop editor.', supportedInput: 'PDF', expectedOutput: 'PDF (Redacted)', estimatedTime: 'N/A', ctaText: 'Open Redaction Tool (unavailable)' } }
];

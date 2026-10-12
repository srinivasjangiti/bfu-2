/**
 * Node.js ESM resolver shim:
 *  1. maps bare `next/server` to the actual file
 *  2. resolves extensionless relative imports (which TypeScript
 *     accepts but Node ESM does not) by trying .ts / .mjs / .js
 *  3. routes pdf-parse's internal `pdfjs-dist/legacy/build/pdf.mjs`
 *     import to pdf-parse's own bundled v5 file, so the v4 worker
 *     in the project doesn't clobber pdf-parse's v5 API.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as pathResolve, extname } from 'node:path';
import { existsSync } from 'node:fs';

const projectRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), '..');

// pdf-parse ships its own pdfjs v5 inside its own node_modules. We
// point its internal import at that copy so the v4 and v5 copies
// don't share a GlobalWorkerOptions global.
const PDF_PARSE_PDFJS = pathToFileURL(
  pathResolve(
    projectRoot,
    'node_modules/pdf-parse/node_modules/pdfjs-dist/legacy/build/pdf.mjs',
  ),
).href;

const PDF_PARSE_WORKER = pathToFileURL(
  pathResolve(
    projectRoot,
    'node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs',
  ),
).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    const target = pathToFileURL(
      pathResolve(projectRoot, 'node_modules/next/server.js'),
    ).href;
    return nextResolve(target, context);
  }

  // When pdf-parse's internal code asks for `pdfjs-dist/legacy/build/pdf.mjs`,
  // give it the copy inside pdf-parse's own node_modules.
  if (
    specifier === 'pdfjs-dist/legacy/build/pdf.mjs' &&
    context.parentURL?.startsWith('file:') &&
    context.parentURL.includes('pdf-parse')
  ) {
    return nextResolve(PDF_PARSE_PDFJS, context);
  }

  // When that internal pdfjs asks for its worker, point at the v5
  // worker that ships next to pdf-parse.
  if (
    specifier === 'pdfjs-dist/legacy/build/pdf.worker.mjs' &&
    context.parentURL?.startsWith('file:') &&
    context.parentURL.includes('pdf-parse')
  ) {
    if (existsSync(new URL(PDF_PARSE_WORKER))) {
      return nextResolve(PDF_PARSE_WORKER, context);
    }
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../'))
    && !extname(specifier)
  ) {
    const parentDir = context.parentURL
      ? dirname(fileURLToPath(context.parentURL))
      : projectRoot;
    for (const ext of ['.ts', '.mjs', '.js']) {
      const candidate = pathResolve(parentDir, `${specifier}${ext}`);
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

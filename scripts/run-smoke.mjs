/**
 * Wrapper that registers the next/server shim then runs the PDF smoke
 * test as a single Node command. Use:
 *   node --experimental-strip-types --no-warnings scripts/run-smoke.mjs
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./scripts/load-with-next-shim.mjs', pathToFileURL('./'));

// Defer to the actual smoke script.
await import('./smoke-pdf-tools.mjs');

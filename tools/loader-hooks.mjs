import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('/shared/')) {
    return next(pathToFileURL(path.join(ROOT, specifier)).href, context);
  }
  return next(specifier, context);
}

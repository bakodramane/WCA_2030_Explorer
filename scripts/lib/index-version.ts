import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Data files whose content defines the index version (B5). */
export const INDEX_FILES = ['chunks.json', 'qa.json', 'items.json', 'glossary.json'];
const MODEL = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;

/** `wca2030-<12 hex>`: a SHA-256 over the name and bytes of every index file, in a fixed order. */
export function computeIndexVersion(dataDir: string): string {
  const hash = createHash('sha256');
  for (const name of INDEX_FILES) {
    const file = path.join(dataDir, name);
    if (!fs.existsSync(file)) throw new Error(`Cannot compute index version: ${file} is missing`);
    hash.update(`${name}\0`).update(fs.readFileSync(file)).update('\0');
  }
  return `wca2030-${hash.digest('hex').slice(0, 12)}`;
}

/** Write model-meta.json to src/data/ and public/data/ with the content-hash version. */
export function writeModelMeta(root: string): { model: string; dim: number; version: string } {
  const publicData = path.join(root, 'public', 'data');
  const meta = { model: MODEL, dim: DIM, version: computeIndexVersion(publicData) };
  const text = `${JSON.stringify(meta, null, 2)}\n`;
  for (const dir of [path.join(root, 'src', 'data'), publicData]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'model-meta.json'), text, 'utf-8');
  }
  return meta;
}

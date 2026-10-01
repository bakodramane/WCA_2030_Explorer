// tests/chunking.test.ts
// Chunk-shape and size assertions. Self-sufficient on a clean checkout:
// src/data/chunks-raw.json is gitignored, so the test falls back to the
// committed public/data/chunks.json (same chunks, plus embeddings).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface Chunk {
  id: string;
  sectionTitle: string;
  pdfPage: number;
  printedPage: number;
  printedPageEnd: number;
  /** @deprecated Alias of printedPage. */
  pageRef: number;
  text: string;
  priority: 'high' | 'normal';
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const rawPath    = path.join(process.cwd(), 'src', 'data', 'chunks-raw.json');
const publicPath = path.join(process.cwd(), 'public', 'data', 'chunks.json');

describe('chunking', () => {
  let chunks: Chunk[] = [];

  beforeAll(() => {
    const src = fs.existsSync(rawPath) ? rawPath : publicPath;
    if (!fs.existsSync(src)) {
      throw new Error(
        `No chunk data found. Ran a build first? Looked for:\n` +
        `  ${rawPath}\n  ${publicPath}`,
      );
    }
    const raw = fs.readFileSync(src, 'utf-8');
    chunks = JSON.parse(raw) as Chunk[];
  });

  // The original 800–6000 bound was a guess made before the corpus was
  // measured. The WCA 2030 body text has ~108 000 unique words, so chunking
  // at 200–350 words yields roughly 430–560 chunks — see §0.3 of the
  // improvement brief. The bound here is 350–1200.
  it('total chunk count is between 350 and 1200', () => {
    expect(chunks.length).toBeGreaterThanOrEqual(350);
    expect(chunks.length).toBeLessThanOrEqual(1200);
  });

  it('no chunk exceeds 420 words', () => {
    for (const chunk of chunks) {
      const wc = wordCount(chunk.text);
      expect(wc, `Chunk ${chunk.id} has ${wc} words`).toBeLessThanOrEqual(420);
    }
  });

  it('every chunk has a non-empty sectionTitle, a positive printedPage, and printedPage = pdfPage − 14', () => {
    for (const chunk of chunks) {
      expect(
        chunk.sectionTitle.trim().length,
        `Chunk ${chunk.id} has empty sectionTitle`,
      ).toBeGreaterThan(0);
      expect(
        chunk.printedPage,
        `Chunk ${chunk.id} has non-positive printedPage (front matter must be excluded)`,
      ).toBeGreaterThan(0);
      expect(
        chunk.pdfPage - chunk.printedPage,
        `Chunk ${chunk.id}: pdfPage − printedPage is not the page offset 14`,
      ).toBe(14);
    }
  });

  it('at least 10% of chunks carry priority: high', () => {
    const highCount = chunks.filter(c => c.priority === 'high').length;
    const ratio = highCount / chunks.length;
    expect(ratio, `Only ${(ratio * 100).toFixed(1)}% are high-priority`).toBeGreaterThanOrEqual(0.1);
  });

  it('all chunk IDs are unique', () => {
    const ids = chunks.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

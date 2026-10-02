// tests/chunk-pages.test.ts
// A2 acceptance: each chunk cites the page of its FIRST word. Sampling 10
// chunks spread across the corpus, the first 8 words of each must occur on
// the extracted text of the chunk's pdfPage.
import { describe, it, expect, beforeAll } from 'vitest';
import { PDFParse } from 'pdf-parse';
import fs from 'node:fs';
import path from 'node:path';
import { SOURCE_PDF_FILE } from '../src/engine/source-pdf';

interface Chunk {
  id: string;
  sectionId: string;
  sectionTitle: string;
  chapterLabel: string;
  paragraphs: string[];
  pdfPage: number;
  printedPage: number;
  printedPageEnd: number;
  text: string;
  priority: 'high' | 'normal';
}

const rawPath    = path.join(process.cwd(), 'src', 'data', 'chunks-raw.json');
const publicPath = path.join(process.cwd(), 'public', 'data', 'chunks.json');
const pdfPath    = path.join(process.cwd(), 'source', SOURCE_PDF_FILE);

function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('A2 — per-chunk page tracking', () => {
  let chunks: Chunk[] = [];
  let pageTexts = new Map<number, string>();

  beforeAll(async () => {
    const src = fs.existsSync(rawPath) ? rawPath : publicPath;
    chunks = JSON.parse(fs.readFileSync(src, 'utf-8')) as Chunk[];

    const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
    const result = await parser.getText();
    await parser.destroy();
    pageTexts = new Map(result.pages.map(p => [p.num, p.text]));
  }, 120_000);

  it('10 sampled chunks: the first 8 words occur on the extracted text of pdfPage', () => {
    expect(chunks.length).toBeGreaterThan(0);
    // Evenly spaced sample — deterministic across runs, spread across the corpus.
    const step = Math.max(1, Math.floor(chunks.length / 10));
    const sample = Array.from({ length: 10 }, (_, i) =>
      chunks[Math.min(i * step, chunks.length - 1)]);

    for (const c of sample) {
      const pageText = pageTexts.get(c.pdfPage);
      expect(pageText, `PDF page ${c.pdfPage} not extracted`).toBeDefined();
      const first8 = c.text.trim().split(/\s+/).slice(0, 8);
      const re = new RegExp(first8.map(escRe).join('\\s+'));
      expect(
        re.test(pageText!),
        `Chunk ${c.id} (pdfPage ${c.pdfPage}): first words not on that page: ` +
        `«${first8.join(' ')}»`,
      ).toBe(true);
    }
  });

  it('printedPage and printedPageEnd are positive, ordered, and offset-consistent for every chunk', () => {
    for (const c of chunks) {
      expect(c.printedPage, `${c.id} printedPage`).toBeGreaterThan(0);
      // printedPageEnd may exceed printedPage when a chunk spans a page break;
      // both derive from PDF pages via the uniform −14 offset.
      expect(c.printedPageEnd, `${c.id} printedPageEnd`).toBeGreaterThanOrEqual(c.printedPage);
      expect(c.pdfPage - c.printedPage, `${c.id} offset`).toBe(14);
    }
  });
});

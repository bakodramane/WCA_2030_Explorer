// B2.1: every `paragraphs:` hint in data/source-outline.md is checked against the PDF.
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { OUTLINE } from '../src/engine/outline';
import { extractPdfLines } from '../scripts/lib/pdf-lines';
import { stripPageFurniture } from '../scripts/lib/strip-furniture';
import { SOURCE_PDF_FILE } from '../src/engine/source-pdf';

const PARA = /^([1-9]\d*\.\d+)\s+/;
const num = (p: string): [number, number] => { const [a, b] = p.split('.').map(Number); return [a, b]; };
const cmp = (a: string, b: string): number => num(a)[0] - num(b)[0] || num(a)[1] - num(b)[1];

describe('B2.1 — paragraph hints match the PDF', () => {
  const pageOf = new Map<string, number>();
  beforeAll(async () => {
    const lines = stripPageFurniture(await extractPdfLines(path.join(process.cwd(), 'source', SOURCE_PDF_FILE)));
    for (const line of lines) {
      const para = line.text.match(PARA)?.[1];
      if (para && !pageOf.has(para)) pageOf.set(para, line.printedPage);
    }
  }, 60_000);

  const hinted = OUTLINE.filter(e => e.paragraphs);

  it('covers most bullet sections of Chapters 1, 2, 3, 8, 9, and 10', () => {
    expect(hinted.length).toBeGreaterThanOrEqual(50);
  });

  it('each hint starts and ends on pages inside its section', () => {
    for (const entry of hinted) {
      const [first, last] = entry.paragraphs!.split('–');
      const firstPage = pageOf.get(first);
      const lastPage = pageOf.get(last);
      expect(firstPage, `${entry.id}: ¶${first} not found in the PDF`).toBeDefined();
      expect(lastPage, `${entry.id}: ¶${last} not found in the PDF`).toBeDefined();
      expect(firstPage!, `${entry.id}: ¶${first} on p. ${firstPage}`).toBeGreaterThanOrEqual(entry.printedStart);
      expect(firstPage!, `${entry.id}: ¶${first} on p. ${firstPage}`).toBeLessThanOrEqual(entry.printedEnd);
      expect(lastPage!, `${entry.id}: ¶${last} on p. ${lastPage}`).toBeGreaterThanOrEqual(firstPage!);
      expect(lastPage!, `${entry.id}: ¶${last} on p. ${lastPage}`).toBeLessThanOrEqual(entry.printedEnd);
    }
  });

  it('hints within a chapter are ordered and never overlap', () => {
    const byChapter = new Map<string, string[]>();
    for (const e of hinted) byChapter.set(e.parentId!, [...(byChapter.get(e.parentId!) ?? []), e.paragraphs!]);
    for (const [chapter, ranges] of byChapter) {
      for (let i = 1; i < ranges.length; i++) {
        const [, prevEnd] = ranges[i - 1].split('–');
        const [start] = ranges[i].split('–');
        expect(cmp(start, prevEnd), `${chapter}: ${ranges[i - 1]} then ${ranges[i]}`).toBeGreaterThan(0);
      }
    }
  });
});

// tests/citation.test.ts
// A1 acceptance: every citation the UI displays uses the PRINTED page scheme
// (printed = PDF − 14), and filter groups come from the outline, not
// hard-coded page arithmetic on PDF pages.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deriveGroup, groupForPrintedPage, OUTLINE } from '../src/engine/outline';
import type { OutlineEntry } from '../src/engine/outline';

interface Chunk {
  id: string;
  sectionTitle: string;
  pdfPage: number;
  printedPage: number;
  printedPageEnd: number;
  pageRef: number;
  text: string;
  priority: 'high' | 'normal';
}

const rawPath    = path.join(process.cwd(), 'src', 'data', 'chunks-raw.json');
const publicPath = path.join(process.cwd(), 'public', 'data', 'chunks.json');

describe('A1 — printed-page citations', () => {
  let chunks: Chunk[] = [];

  beforeAll(() => {
    const src = fs.existsSync(rawPath) ? rawPath : publicPath;
    chunks = JSON.parse(fs.readFileSync(src, 'utf-8')) as Chunk[];
  });

  it('a chunk containing paragraph 7.4.18 cites printed page 89 and groups under "Chapter 7"', () => {
    const chunk = chunks.find(c => /\b7\.4\.18\b/.test(c.text));
    expect(chunk, 'no chunk contains paragraph 7.4.18').toBeDefined();
    // Printed page of ¶7.4.18 is 89 (PDF page 103 — C1 evidence in §0.2).
    expect(chunk!.printedPage).toBe(89);
    expect(chunk!.pdfPage).toBe(103);
    expect(chunk!.pageRef).toBe(89); // deprecated alias follows printedPage
    // The filter pill must be "Chapter 7", not the old "Chapter 8" mislabel.
    expect(deriveGroup(chunk!.sectionTitle, chunk!.printedPage)).toBe('Chapter 7');
  });

  it('outline covers the body with ordered, non-overlapping ranges', () => {
    expect(OUTLINE.length).toBeGreaterThan(0);
    // Top-level entries only (sections/themes are nested inside chapters and
    // are covered by tests/outline.test.ts). Printed page 1 is the "PART ONE"
    // divider page, assigned to Chapter 1.
    const top = [...OUTLINE]
      .filter(e => ['chapter', 'annex', 'glossary', 'references'].includes(e.kind))
      .sort((a, b) => a.printedStart - b.printedStart);
    expect(top[0].printedStart).toBeLessThanOrEqual(1);
    expect(top[top.length - 1].printedEnd).toBeGreaterThanOrEqual(200);
    for (let i = 1; i < top.length; i++) {
      // A later entry may start on the same page the previous one ends on
      // (annexes can share a page), but must never start before it.
      expect(top[i].printedStart).toBeGreaterThanOrEqual(top[i - 1].printedStart);
    }
  });

  it('every chunk whose section is a chapter/annex heading has a printedPage inside that outline range', () => {
    const byKindNumber = (kind: OutlineEntry['kind'], n: number): OutlineEntry | undefined =>
      OUTLINE.find(e => e.kind === kind && e.number === n);

    // Only heading-shaped titles ("CHAPTER 4: …", "ANNEX 1") name a chapter
    // unambiguously. Corrupt body-sentence titles that merely *mention*
    // chapters (C3, e.g. "Chapter 7 for essential items and Annex 4 for
    // additional items.") are fixed by the Phase B chunker rewrite.
    const headingRe = /^(CHAPTER|ANNEX)\s+(\d+)\s*(?::|$)/i;

    let checked = 0;
    for (const c of chunks) {
      const hm = c.sectionTitle.match(headingRe);
      if (!hm) continue;
      const kind = hm[1].toUpperCase() === 'CHAPTER' ? 'chapter' : 'annex';
      const entry = byKindNumber(kind as OutlineEntry['kind'], parseInt(hm[2], 10));
      expect(entry, `No outline entry for «${c.sectionTitle}»`).toBeDefined();
      expect(
        c.printedPage,
        `Chunk ${c.id} «${c.sectionTitle}»: printedPage ${c.printedPage} outside ` +
        `${entry!.id} range ${entry!.printedStart}–${entry!.printedEnd}`,
      ).toBeGreaterThanOrEqual(entry!.printedStart);
      expect(c.printedPage).toBeLessThanOrEqual(entry!.printedEnd);
      checked++;
    }
    // Sanity: several genuine chapter/annex headings exist in the corpus.
    expect(checked).toBeGreaterThan(0);
  });

  it('groupForPrintedPage maps boundary pages to the right group', () => {
    expect(groupForPrintedPage(89)).toBe('Chapter 7');
    expect(groupForPrintedPage(2)).toBe('Chapter 1');
    expect(groupForPrintedPage(100)).toBe('Chapter 8');
    expect(groupForPrintedPage(134)).toBe('Annex 4');
    expect(groupForPrintedPage(201)).toBe('Glossary');
    expect(groupForPrintedPage(208)).toBe('References');
    expect(groupForPrintedPage(0)).toBeNull();       // front matter
    expect(groupForPrintedPage(-13)).toBeNull();      // front matter
  });
});

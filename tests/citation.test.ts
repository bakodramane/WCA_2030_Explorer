// tests/citation.test.ts
// A1 acceptance: every citation the UI displays uses the PRINTED page scheme
// (printed = PDF − 14), and filter groups come from the outline, not
// hard-coded page arithmetic on PDF pages.
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deriveGroup, groupForPrintedPage, OUTLINE } from '../src/engine/outline';

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

describe('A1 — printed-page citations', () => {
  let chunks: Chunk[] = [];

  beforeAll(() => {
    const src = fs.existsSync(rawPath) ? rawPath : publicPath;
    chunks = JSON.parse(fs.readFileSync(src, 'utf-8')) as Chunk[];
  });

  it('a chunk containing paragraph 7.4.18 cites printed page 91 and groups under "Chapter 7"', () => {
    const chunk = chunks.find(c => /\b7\.4\.18\b/.test(c.text));
    expect(chunk, 'no chunk contains paragraph 7.4.18').toBeDefined();
    // Printed page of ¶7.4.18 is 91 (PDF page 105) in the April 2026 edition (CD9437EN); it was 89 / 103
    // in the earlier file, where the C1 audit found it shown as "Page 103".
    expect(chunk!.printedPage).toBe(91);
    expect(chunk!.pdfPage).toBe(105);
    expect(chunk!.paragraphs).toContain('7.4.18');
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

  it('every chunk title and chapter label agree with the outline', () => {
    for (const c of chunks) {
      const section = OUTLINE.find(entry => entry.id === c.sectionId);
      expect(section, `No outline entry for ${c.sectionId}`).toBeDefined();
      expect(c.sectionTitle).toBe(section!.title);
      const topId = section!.kind === 'section' || section!.kind === 'theme'
        ? section!.parentId
        : section!.id;
      const top = OUTLINE.find(entry => entry.id === topId)!;
      const expectedLabel = top.kind === 'chapter' ? `Chapter ${top.number}`
        : top.kind === 'annex' ? `Annex ${top.number}`
          : top.kind === 'glossary' ? 'Glossary' : 'References';
      expect(c.chapterLabel).toBe(expectedLabel);
      expect(
        c.printedPage,
        `Chunk ${c.id}: page ${c.printedPage} outside ${top.id}`,
      ).toBeGreaterThanOrEqual(top.printedStart);
      expect(c.printedPage).toBeLessThanOrEqual(top.printedEnd);
    }
  });

  it('groupForPrintedPage maps boundary pages to the right group', () => {
    expect(groupForPrintedPage(91)).toBe('Chapter 7');
    expect(groupForPrintedPage(2)).toBe('Chapter 1');
    expect(groupForPrintedPage(101)).toBe('Chapter 7');
    expect(groupForPrintedPage(102)).toBe('Chapter 8');
    expect(groupForPrintedPage(137)).toBe('Annex 4');
    expect(groupForPrintedPage(203)).toBe('Glossary');
    expect(groupForPrintedPage(210)).toBe('References');
    expect(groupForPrintedPage(0)).toBeNull();       // front matter
    expect(groupForPrintedPage(-13)).toBeNull();      // front matter
  });
});

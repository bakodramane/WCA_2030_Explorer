import { describe, expect, it } from 'vitest';
import type { AssignedUnit } from '../scripts/lib/assign-section';
import { packUnits } from '../scripts/lib/pack';

function unit(sectionId: string, paragraph: string, count: number, page = 40): AssignedUnit {
  const text = Array.from({ length: count }, (_, index) => `w${index}`).join(' ');
  return {
    paragraphNumber: paragraph,
    glossaryTerm: null,
    lines: [{ text, pdfPage: page + 14, printedPage: page, lineIndexFromTop: 3, lineIndexFromBottom: 3 }],
    text,
    pdfPage: page + 14,
    printedPage: page,
    printedPageEnd: page,
    sectionId,
    sectionTitle: `Section ${sectionId}`,
    chapterLabel: 'Chapter 4',
    priority: 'high',
  };
}

describe('B2 unit packing', () => {
  it('packs consecutive units without crossing section boundaries', () => {
    const chunks = packUnits([
      unit('s1', '4.1', 120),
      unit('s1', '4.2', 120),
      unit('s2', '4.3', 100),
    ]);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text.split(' ')).toHaveLength(240);
    expect(chunks[0].paragraphs).toEqual(['4.1', '4.2']);
    expect(chunks[0].id).toBe('s1-4.1-1');
    expect(chunks[1].sectionId).toBe('s2');
  });

  it('splits only an oversized unit with exactly 50 words of overlap', () => {
    const chunks = packUnits([unit('s1', '4.1', 720)]);
    const words = chunks.map(chunk => chunk.text.split(' '));

    expect(words.map(part => part.length)).toEqual([350, 350, 120]);
    expect(words[0].slice(-50)).toEqual(words[1].slice(0, 50));
    expect(words[1].slice(-50)).toEqual(words[2].slice(0, 50));
    expect(chunks.every(chunk => chunk.paragraphs[0] === '4.1')).toBe(true);
  });
});

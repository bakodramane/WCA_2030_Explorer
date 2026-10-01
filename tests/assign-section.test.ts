import { describe, expect, it } from 'vitest';
import type { PdfLine } from '../scripts/lib/pdf-lines';
import {
  assignUnitsToSections,
  type ChunkOutlineEntry,
} from '../scripts/lib/assign-section';
import { splitIntoUnits } from '../scripts/lib/units';

const outline: ChunkOutlineEntry[] = [
  { id: 'ch4', kind: 'chapter', number: 4, title: 'Concepts and Definitions', printedStart: 37, printedEnd: 46, parentId: 'part-two' },
  { id: 'ch4-4.21', kind: 'section', number: 4.21, title: 'Agricultural Holder', printedStart: 40, printedEnd: 40, parentId: 'ch4' },
  { id: 'ch4-4.25', kind: 'section', number: 4.25, title: 'Scope of the Census of Agriculture', printedStart: 41, printedEnd: 41, parentId: 'ch4' },
  { id: 'ch7', kind: 'chapter', number: 7, title: 'Description of Essential Items', printedStart: 74, printedEnd: 99, parentId: 'part-two' },
  { id: 'ch7-theme2', kind: 'theme', number: 2, title: 'Theme 2: Land', printedStart: 79, printedEnd: 86, parentId: 'ch7' },
  { id: 'ch7-theme3', kind: 'theme', number: 3, title: 'Theme 3: Irrigation', printedStart: 86, printedEnd: 87, parentId: 'ch7' },
  { id: 'annex4', kind: 'annex', number: 4, title: 'Additional Items', printedStart: 134, printedEnd: 172, parentId: 'annexes' },
  { id: 'glossary', kind: 'glossary', number: 0, title: 'Glossary of Terms', printedStart: 201, printedEnd: 211, parentId: null },
];

function sourceLine(text: string, page: number): PdfLine {
  return { text, pdfPage: page + 14, printedPage: page, lineIndexFromTop: 3, lineIndexFromBottom: 3 };
}

describe('B2 outline assignment', () => {
  it('uses paragraph prefixes to refine ambiguous page assignments', () => {
    const units = splitIntoUnits([
      sourceLine('4.24 Holder guidance', 41),
      sourceLine('7.2.13 Land guidance', 86),
      sourceLine('A4.3 Additional item', 136),
      sourceLine('Agricultural holder: Glossary definition', 201),
    ], { isGlossaryPage: page => page === 201 });

    const assigned = assignUnitsToSections(units, outline);
    expect(assigned.map(unit => unit.sectionId)).toEqual([
      'ch4-4.21', 'ch7-theme2', 'annex4', 'glossary',
    ]);
    expect(assigned.map(unit => unit.chapterLabel)).toEqual([
      'Chapter 4', 'Chapter 7', 'Annex 4', 'Glossary',
    ]);
    expect(assigned.every(unit => unit.priority === 'high')).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import type { PdfLine } from '../scripts/lib/pdf-lines';
import {
  assignUnitsToSections,
  type ChunkOutlineEntry,
} from '../scripts/lib/assign-section';
import { splitIntoUnits } from '../scripts/lib/units';
import { buildHeadingMatcher } from '../scripts/lib/headings';

const outline: ChunkOutlineEntry[] = [
  { id: 'ch4', kind: 'chapter', number: 4, title: 'Concepts and Definitions', printedStart: 37, printedEnd: 46, parentId: 'part-two' },
  { id: 'ch4-4.21', kind: 'section', number: 4.21, title: 'Agricultural Holder', printedStart: 40, printedEnd: 40, parentId: 'ch4' },
  { id: 'ch4-4.25', kind: 'section', number: 4.25, title: 'Scope of the Census of Agriculture', printedStart: 41, printedEnd: 41, parentId: 'ch4' },
  { id: 'ch2', kind: 'chapter', number: 2, title: 'Importance', printedStart: 12, printedEnd: 23, parentId: 'part-one' },
  { id: 'ch2-introduction', kind: 'section', number: 0, title: 'Introduction', printedStart: 12, printedEnd: 13, parentId: 'ch2', paragraphs: '2.1–2.4' },
  { id: 'ch2-food-security', kind: 'section', number: 0, title: 'Food security', printedStart: 13, printedEnd: 14, parentId: 'ch2', paragraphs: '2.8–2.10' },
  { id: 'ch2-work', kind: 'section', number: 0, title: 'Work in agriculture', printedStart: 14, printedEnd: 15, parentId: 'ch2', paragraphs: '2.11–2.15' },
  { id: 'ch7', kind: 'chapter', number: 7, title: 'Description of Essential Items', printedStart: 74, printedEnd: 99, parentId: 'part-two' },
  { id: 'ch7-theme2', kind: 'theme', number: 2, title: 'Theme 2: Land', printedStart: 79, printedEnd: 86, parentId: 'ch7' },
  { id: 'ch7-theme3', kind: 'theme', number: 3, title: 'Theme 3: Irrigation', printedStart: 86, printedEnd: 87, parentId: 'ch7' },
  { id: 'annex4', kind: 'annex', number: 4, title: 'Additional Items', printedStart: 134, printedEnd: 172, parentId: 'annexes' },
  { id: 'annex4-theme9', kind: 'theme', number: 9, title: 'Annex 4 · Theme 9: Work on the holding', printedStart: 164, printedEnd: 164, parentId: 'annex4' },
  { id: 'annex4-theme10', kind: 'theme', number: 10, title: 'Annex 4 · Theme 10: Aquaculture', printedStart: 164, printedEnd: 166, parentId: 'annex4' },
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

  it('does not treat annex classification codes as chapter paragraphs', () => {
    const units = splitIntoUnits([sourceLine('4.03 Crop classification entry', 136)]);
    const assigned = assignUnitsToSections(units, outline);
    expect(assigned[0].sectionId).toBe('annex4');
    expect(assigned[0].chapterLabel).toBe('Annex 4');
  });

  it('B2.1: assigns by heading, then by paragraph hint', () => {
    const units = splitIntoUnits([
      sourceLine('2.3 Introductory paragraph', 12),
      sourceLine('FOOD', 14),
      sourceLine('SECURITY', 14),
      sourceLine('2.8 Food paragraph', 14),
      sourceLine('A table caption with no number', 14),
      sourceLine('2.11 Work paragraph', 14),
    ], { matchHeading: buildHeadingMatcher(outline) });

    expect(units.map(u => u.headingSectionId)).toEqual([null, 'ch2-food-security', null, null]);
    expect(units[2].text).toContain('A table caption');
    expect(assignUnitsToSections(units, outline).map(u => u.sectionId)).toEqual([
      'ch2-introduction', 'ch2-food-security', 'ch2-food-security', 'ch2-work',
    ]);
  });

  it('B2.1: splits Annex 4 at theme headings, shares the boundary page, and carries the theme forward', () => {
    const units = splitIntoUnits([
      sourceLine('0901 Item text for work on the holding', 164),
      sourceLine('THEME 10: AQUACULTURE', 164),
      sourceLine('1001 Item text for aquaculture', 164),
      sourceLine('A4.3 An annex paragraph on the next page', 165),
    ], { matchHeading: buildHeadingMatcher(outline) });
    const assigned = assignUnitsToSections(units, outline);
    expect(assigned.map(u => u.sectionId)).toEqual(['annex4-theme9', 'annex4-theme10', 'annex4-theme10']);
    expect(assigned.map(u => u.sectionTitle)[1]).toBe('Annex 4 · Theme 10: Aquaculture');
    expect(assigned.every(u => u.chapterLabel === 'Annex 4')).toBe(true);
  });

  it('B2.1: drops dotted classification codes from annex paragraph lists', () => {
    const units = splitIntoUnits([sourceLine('1.90 Other cereals', 136)]);
    expect(assignUnitsToSections(units, outline)[0].paragraphNumber).toBeNull();
  });

  it('B2.1: keeps chapter-level titles for chapter intro paragraphs with no hint', () => {
    const units = splitIntoUnits([sourceLine('2.5 Paragraph between hint ranges', 13)]);
    expect(assignUnitsToSections(units, outline)[0].sectionId).toBe('ch2');
  });
});

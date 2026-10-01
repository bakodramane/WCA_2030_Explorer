import { describe, expect, it } from 'vitest';
import type { PdfLine } from '../scripts/lib/pdf-lines';
import type { HeadingMatcher } from '../scripts/lib/headings';
import { splitIntoUnits } from '../scripts/lib/units';

function line(text: string, printedPage: number): PdfLine {
  return {
    text,
    pdfPage: printedPage + 14,
    printedPage,
    lineIndexFromTop: 3,
    lineIndexFromBottom: 3,
  };
}

describe('B2 paragraph units', () => {
  it('keeps introductions separate and detects body and annex paragraphs', () => {
    const units = splitIntoUnits([
      line('Section introduction', 37),
      line('4.24 First body paragraph', 37),
      line('continues on the next line', 38),
      line('7.2.13 A nested paragraph', 81),
      line('A4.3 An annex paragraph', 136),
    ]);

    expect(units.map(unit => unit.paragraphNumber)).toEqual([
      null, '4.24', '7.2.13', 'A4.3',
    ]);
    expect(units[1].text).toContain('continues on the next line');
    expect(units[1].printedPageEnd).toBe(38);
  });

  it('treats glossary entries as atomic units only on glossary pages', () => {
    const units = splitIntoUnits([
      line('Glossary introduction', 201),
      line('Agricultural holder: A person who makes the major decisions', 201),
      line('and exercises management control.', 201),
      line('Agricultural holding: An economic unit of production', 201),
    ], { isGlossaryPage: page => page >= 201 && page <= 211 });

    expect(units.map(unit => unit.glossaryTerm)).toEqual([
      null, 'Agricultural holder', 'Agricultural holding',
    ]);
    expect(units[1].text).toContain('management control');
  });

  it('ends a numbered paragraph when a chapter or annex begins', () => {
    const units = splitIntoUnits([
      line('10.31 Final chapter paragraph', 126),
      line('ANNEX 1', 127),
      line('Unnumbered annex introduction', 127),
      line('ANNEX 2', 130),
    ]);

    expect(units.map(unit => unit.paragraphNumber)).toEqual(['10.31', null, null]);
    expect(units[0].printedPageEnd).toBe(126);
    expect(units[1].text).toContain('Unnumbered annex introduction');
  });

  it('B2.1: does not read a wrapped cross-reference as a paragraph start', () => {
    const units = splitIntoUnits([
      line('4.15 A real paragraph that ends with a see', 143),
      line('4.16 for more information on how to report crops', 143),
      line('4.17 Another real paragraph', 143),
    ]);
    expect(units.map(unit => unit.paragraphNumber)).toEqual(['4.15', '4.17']);
    expect(units[0].text).toContain('4.16 for more information');
  });

  it('B2.1: a heading from the outline starts its own unit and tags the section', () => {
    const matchHeading: HeadingMatcher = (lines, index) =>
      lines[index].text === 'FOOD SECURITY' ? { entryId: 'ch2-food-security', span: 1 } : null;
    const units = splitIntoUnits([
      line('2.7 Last paragraph of the previous section', 14),
      line('FOOD SECURITY', 14),
      line('2.8 First paragraph', 14),
    ], { matchHeading });
    expect(units.map(unit => unit.headingSectionId)).toEqual([null, 'ch2-food-security', null]);
    expect(units[1].text).toBe('FOOD SECURITY');
  });
});

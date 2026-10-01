import { describe, expect, it } from 'vitest';
import type { PdfLine } from '../scripts/lib/pdf-lines';
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
});

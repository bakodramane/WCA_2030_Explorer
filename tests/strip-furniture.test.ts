import { describe, expect, it } from 'vitest';
import type { PdfLine } from '../scripts/lib/pdf-lines';
import { stripPageFurniture } from '../scripts/lib/strip-furniture';

function line(
  text: string,
  pdfPage: number,
  top: number,
  bottom: number,
): PdfLine {
  return {
    text,
    pdfPage,
    printedPage: pdfPage - 14,
    lineIndexFromTop: top,
    lineIndexFromBottom: bottom,
  };
}

describe('B2 strip-furniture', () => {
  it('drops front matter, page numbers, and headers repeated at page edges', () => {
    const header = 'WORLD PROGRAMME FOR THE CENSUS OF AGRICULTURE 2030';
    const lines: PdfLine[] = [line('Contents', 14, 0, 0)];
    for (let pdfPage = 15; pdfPage <= 19; pdfPage++) {
      lines.push(line(String(pdfPage - 14), pdfPage, 0, 4));
      lines.push(line(header, pdfPage, 1, 3));
      lines.push(line(`Body ${pdfPage}`, pdfPage, 3, 1));
    }

    const kept = stripPageFurniture(lines).map(item => item.text);
    expect(kept).toEqual(['Body 15', 'Body 16', 'Body 17', 'Body 18', 'Body 19']);
  });

  it('drops a one-line chapter running header even on fewer than five pages, keeping the opening heading', () => {
    const lines: PdfLine[] = [
      // Chapter-opening page: heading set on two lines, kept.
      line('CHAPTER 1', 17, 0, 5), line('INTRODUCTION', 17, 1, 4), line('1.1 Body text', 17, 3, 2),
      // Running header on two later pages only, at the top edge: dropped.
      line('CHAPTER 1: INTRODUCTION', 19, 1, 4), line('Body 19', 19, 3, 2),
      line('CHAPTER 1: INTRODUCTION', 21, 1, 4), line('Body 21', 21, 3, 2),
      // The same words inside the page body are content, kept.
      line('CHAPTER 1: INTRODUCTION', 23, 4, 4), line('Body 23', 23, 5, 3),
    ];
    expect(stripPageFurniture(lines).map(item => item.text)).toEqual([
      'CHAPTER 1', 'INTRODUCTION', '1.1 Body text', 'Body 19', 'Body 21', 'CHAPTER 1: INTRODUCTION', 'Body 23',
    ]);
  });

  it('keeps repeated body text and protected item 0101 metadata', () => {
    const lines: PdfLine[] = [];
    for (let pdfPage = 70; pdfPage <= 74; pdfPage++) {
      lines.push(line('Reference period: census reference year', pdfPage, 1, 3));
      lines.push(line('Essential item. Reference period: census reference day', pdfPage, 2, 2));
      lines.push(line('Repeated substantive guidance', pdfPage, 4, 3));
    }

    const kept = stripPageFurniture(lines).map(item => item.text);
    expect(kept.filter(text => text.startsWith('Reference period:'))).toHaveLength(5);
    expect(kept.filter(text => text.startsWith('Essential item.'))).toHaveLength(5);
    expect(kept.filter(text => text === 'Repeated substantive guidance')).toHaveLength(5);
  });

  it('drops title-only part divider pages', () => {
    const kept = stripPageFurniture([
      line('PART TWO', 50, 0, 3),
      line('THE WORLD PROGRAMME', 50, 1, 2),
      line('FOR THE CENSUS', 50, 2, 1),
      line('OF AGRICULTURE 2030', 50, 3, 0),
      line('4.1 Substantive guidance', 51, 3, 3),
    ]);

    expect(kept.map(item => item.text)).toEqual(['4.1 Substantive guidance']);
  });
});

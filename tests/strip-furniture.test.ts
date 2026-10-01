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
});

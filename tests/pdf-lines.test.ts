import { describe, expect, it } from 'vitest';
import {
  PRINTED_PAGE_OFFSET,
  linesFromPages,
} from '../scripts/lib/pdf-lines';

describe('B2 pdf-lines', () => {
  it('records PDF/printed pages and non-empty line positions', () => {
    const lines = linesFromPages([
      { num: 14, text: 'Front matter\n\nFooter' },
      { num: 15, text: '1\nFirst body line\nLast body line' },
    ]);

    expect(PRINTED_PAGE_OFFSET).toBe(14);
    expect(lines).toEqual([
      {
        text: 'Front matter', pdfPage: 14, printedPage: 0,
        lineIndexFromTop: 0, lineIndexFromBottom: 1,
      },
      {
        text: 'Footer', pdfPage: 14, printedPage: 0,
        lineIndexFromTop: 1, lineIndexFromBottom: 0,
      },
      {
        text: '1', pdfPage: 15, printedPage: 1,
        lineIndexFromTop: 0, lineIndexFromBottom: 2,
      },
      {
        text: 'First body line', pdfPage: 15, printedPage: 1,
        lineIndexFromTop: 1, lineIndexFromBottom: 1,
      },
      {
        text: 'Last body line', pdfPage: 15, printedPage: 1,
        lineIndexFromTop: 2, lineIndexFromBottom: 0,
      },
    ]);
  });
});

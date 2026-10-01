// OD.5: item-code and figure/table lookups fire only when the code is the main content of the query.
import { describe, expect, it } from 'vitest';
import { extractFigureTableRef, extractItemCode } from '../src/engine/answer';

describe('OD.5 — item-code lookup', () => {
  it('fires for a bare code, with or without leading zero', () => {
    expect(extractItemCode('0903')).toBe('0903');
    expect(extractItemCode('903')).toBe('0903');
    expect(extractItemCode('  0115 ')).toBe('0115');
  });

  it('fires for "item <code>" in any case, with trailing punctuation', () => {
    expect(extractItemCode('item 903')).toBe('0903');
    expect(extractItemCode('Item 0903')).toBe('0903');
    expect(extractItemCode('ITEM 0903?')).toBe('0903');
  });

  it('fires for a code plus at most two other words', () => {
    expect(extractItemCode('item 0903 definition')).toBe('0903');
    expect(extractItemCode('0903 definition')).toBe('0903');
    expect(extractItemCode('definition of 903')).toBe('0903');
  });

  it('does not fire for a longer question that merely mentions a code', () => {
    expect(extractItemCode('What does WCA 2030 say about Item 0903?')).toBeNull();
    expect(extractItemCode('Do items 0301 to 0308 ask whether holdings are equipped for irrigation?')).toBeNull();
    expect(extractItemCode('item 0903 definition and reference period')).toBeNull();
    expect(extractItemCode('Should the immigrant status of workers be collected for Item 0903?')).toBeNull();
  });

  it('does not fire without a code, with several codes, or for numbers of the wrong length', () => {
    expect(extractItemCode('holder')).toBeNull();
    expect(extractItemCode('0903 0904')).toBeNull();
    expect(extractItemCode('12')).toBeNull();
    expect(extractItemCode('12345')).toBeNull();
    expect(extractItemCode('0000')).toBeNull();
  });
});

describe('OD.5 — figure/table lookup', () => {
  it('fires for "<kind> <ref>" and for up to two extra words', () => {
    expect(extractFigureTableRef('Table 9.1')).toEqual({ kind: 'table', ref: '9.1' });
    expect(extractFigureTableRef('figure A10.1')).toEqual({ kind: 'figure', ref: 'A10.1' });
    expect(extractFigureTableRef('Figure 6.1 decision tree')).toEqual({ kind: 'figure', ref: '6.1' });
    expect(extractFigureTableRef('Table 9.1?')).toEqual({ kind: 'table', ref: '9.1' });
  });

  it('does not fire for a longer question or one that does not start with the kind', () => {
    expect(extractFigureTableRef('Table 9.1 shows which cross-tabulations for essential items')).toBeNull();
    expect(extractFigureTableRef('What does Table 9.1 show?')).toBeNull();
    expect(extractFigureTableRef('table of contents')).toBeNull();
  });
});

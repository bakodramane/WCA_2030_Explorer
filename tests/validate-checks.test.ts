import { describe, expect, it } from 'vitest';
import { buildSourceText, findStartPages } from '../scripts/lib/source-text';
import { compactKey, normaliseForMatch } from '../scripts/lib/normalise';
import {
  checkChunks, checkGlossary, checkItems, checkQaJsonSync, checkQaRows,
} from '../scripts/lib/validate-checks';

const source = buildSourceText(new Map([
  [10, 'The holder is the person who makes the major decisions. \u008b Land under crops; \u008b Land fallow;'],
  [11, 'A holding “may” be an enterprise – or a household.'],
  [12, 'Third page text appears here.'],
  [203, 'Fallow: Land left uncultivated for a season. Holder: The decision maker.'],
]));

describe('normalisation', () => {
  it('maps bullets, quotes, dashes, and whitespace', () => {
    expect(normaliseForMatch('a“b” –  c\u008b')).toBe('a"b" - c•');
    expect(compactKey('Land  under\ncrops')).toBe('Landundercrops');
  });
});

describe('verbatim lookup', () => {
  it('finds excerpts across page breaks and reports the starting page', () => {
    expect(findStartPages(source, 'Land fallow; A holding "may" be')).toEqual([10]);
    expect(findStartPages(source, 'not in the source at all')).toEqual([]);
  });

  it('can ignore bullet markers for flattened lists', () => {
    expect(findStartPages(source, 'Land under crops; Land fallow;', false)).toEqual([]);
    expect(findStartPages(source, 'Land under crops; Land fallow;', true)).toEqual([10]);
  });
});

describe('checks', () => {
  it('flags non-verbatim excerpts and pages more than one page away', () => {
    const rows = [
      { question: 'ok', page_number: '10', excerpt: 'The holder is the person who makes' },
      { question: 'off by one', page_number: '11', excerpt: 'The holder is the person who makes' },
      { question: 'wrong page', page_number: '12', excerpt: 'The holder is the person who makes' },
      { question: 'invented', page_number: '10', excerpt: 'The holder is a farmer who owns land' },
    ];
    const failures = checkQaRows(source, rows);
    expect(failures.map(f => f.check)).toEqual(['page-mismatch', 'excerpt-not-verbatim']);
    expect(failures[0].suggestedPage).toBe(10);
  });

  it('detects a stale qa.json', () => {
    const csv = [{ question: 'q', page_number: '10', excerpt: 'x' }];
    expect(checkQaJsonSync(csv, csv)).toEqual([]);
    expect(checkQaJsonSync(csv, [{ ...csv[0], page_number: '11' }])).toHaveLength(1);
  });

  it('checks items, glossary entries, and chunks', () => {
    expect(checkItems(source, [{ code: '1', name: 'n', description: 'Land under crops; Land fallow;', page: 10 }])).toEqual([]);
    expect(checkItems(source, [{ code: '2', name: 'n', description: 'made up', page: 10 }])).toHaveLength(1);
    expect(checkGlossary(source, [{ term: 'Fallow', definition: 'Land left uncultivated for a season.' }])).toEqual([]);
    expect(checkGlossary(source, [{ term: 'Fallow', definition: 'Land left idle.' }])).toHaveLength(1);
    expect(checkChunks(source, [{ id: 'a', text: 'Third page text appears here.', printedPage: 12 }])).toEqual([]);
    expect(checkChunks(source, [{ id: 'b', text: 'Third page text appears here.', printedPage: 11 }])[0].check).toBe('page-mismatch');
  });
});

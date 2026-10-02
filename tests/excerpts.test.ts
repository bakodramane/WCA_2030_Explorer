import { describe, expect, it } from 'vitest';
import { buildSourceText } from '../scripts/lib/source-text';
import { checkQaRows } from '../scripts/lib/validate-checks';
import { excerptCitation, joinPassages, pagesLabel, parseExcerpts, PASSAGE_SEPARATOR, splitPages } from '../src/engine/excerpts';
import { qaAnswerBlockHtml } from '../src/ui/qa-block';

const source = buildSourceText(new Map([
  [34, 'Theme 1 is identification. Theme 2 is land.'],
  [36, 'Theme 3 is irrigation, and theme 4 is crops.'],
]));

describe('OD.3 — multi-passage excerpts', () => {
  it('a single-passage row is unchanged', () => {
    expect(parseExcerpts('Only one passage.', '12')).toEqual([{ text: 'Only one passage.', printedPage: 12 }]);
  });

  it('splits passages on a line holding only [...] and pairs each with its page', () => {
    const excerpt = `First passage.${PASSAGE_SEPARATOR}Second passage.`;
    expect(excerpt).toBe('First passage.\n [...] \nSecond passage.');
    expect(parseExcerpts(excerpt, '34; 36')).toEqual([
      { text: 'First passage.', printedPage: 34 }, { text: 'Second passage.', printedPage: 36 },
    ]);
    expect(joinPassages(['a', 'b'])).toBe('a\n [...] \nb');
    expect(splitPages('34; 36')).toEqual([34, 36]);
  });

  it('labels pages and lists every page in the copied citation', () => {
    const p = parseExcerpts('A.\n [...] \nB.', '79; 81');
    expect(pagesLabel(p)).toBe('Pages 79, 81');
    expect(excerptCitation('Theme 2: Land', p)).toBe('WCA 2030, Theme 2: Land (pp. 79, 81): "A.…"');
    expect(excerptCitation('X', parseExcerpts('A.', '5'))).toBe('WCA 2030, X (p. 5): "A.…"');
  });

  it('renders the passages in order with an ellipsis rule and each page', () => {
    const html = qaAnswerBlockHtml({ question: 'q', answer: 'a', page_number: '34; 36', section_title: 'S', excerpt: 'First.\n [...] \nSecond.', tags: '', confidence: '', embedding: [] });
    expect(html.indexOf('First.')).toBeLessThan(html.indexOf('qa-gap'));
    expect(html.indexOf('qa-gap')).toBeLessThan(html.indexOf('Second.'));
    expect(html).toContain('p. 34');
    expect(html).toContain('p. 36');
    expect(html).toContain('Pages 34, 36');
  });

  it('validates every passage individually, on its own page', () => {
    const row = (excerpt: string, page: string) => [{ question: 'q', page_number: page, excerpt }];
    expect(checkQaRows(source, row('Theme 1 is identification.\n [...] \nTheme 3 is irrigation, and theme 4 is crops.', '34; 36'))).toEqual([]);
    const wrongPage = checkQaRows(source, row('Theme 1 is identification.\n [...] \nTheme 3 is irrigation, and theme 4 is crops.', '34; 40'));
    expect(wrongPage.map(f => f.check)).toEqual(['page-mismatch']);
    const invented = checkQaRows(source, row('Theme 1 is identification.\n [...] \nTheme 9 is invented.', '34; 36'));
    expect(invented.map(f => f.check)).toEqual(['excerpt-not-verbatim']);
    expect(checkQaRows(source, row('Theme 1 is identification.\n [...] \nTheme 3 is irrigation, and theme 4 is crops.', '34')).map(f => f.check)).toEqual(['passage-page-count']);
  });
});

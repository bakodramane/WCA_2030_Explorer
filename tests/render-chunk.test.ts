// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RankedResult } from '../src/engine/types';
import { ResultCard } from '../src/ui/ResultCard';

const result: RankedResult = {
  chunk: {
    id: 'ch7-theme2-7.2.13-1',
    sectionId: 'ch7-theme2',
    sectionTitle: 'Theme 2: Land',
    chapterLabel: 'Chapter 7',
    paragraphs: ['7.2.13'],
    pdfPage: 95,
    printedPage: 81,
    printedPageEnd: 81,
    text: '7.2.13 This is verbatim guidance about land use.',
    priority: 'high',
    embedding: [],
  },
  score: 0.7,
  rawScore: 0.61,
  matchType: 'semantic',
};

beforeAll(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
});

describe('B2 paragraph citations', () => {
  it('renders and copies the paragraph, canonical section, and printed page', () => {
    const card = ResultCard.render(result, 'land use');
    expect(card.querySelector('.card-source')!.textContent)
      .toBe('§7.2.13 · Theme 2: Land · p. 81');

    const citation = card.querySelector<HTMLButtonElement>('.copy-btn')!.dataset.citation!;
    expect(citation).toBe(
      'WCA 2030, §7.2.13, Theme 2: Land (p. 81): ' +
      '"7.2.13 This is verbatim guidance about land use.…"',
    );
  });
});

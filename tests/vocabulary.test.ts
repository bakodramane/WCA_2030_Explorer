import { describe, expect, it } from 'vitest';
import { buildVocabulary, contentWords, isDomainVocabularyQuery, stemWord } from '../src/engine/vocabulary';

const vocabulary = buildVocabulary([
  'Agricultural holder', 'Land temporarily fallow', 'How are intercropped and mixed crops measured?',
  'Tabulation', 'Data on rare events', 'Sex', undefined as unknown as string,
]);

describe('C0.2 — domain vocabulary gate', () => {
  it('stems plurals and verb endings to a shared form', () => {
    expect(stemWord('holders')).toBe('holder');
    expect(stemWord('intercropping')).toBe('intercrop');
    expect(stemWord('intercropped')).toBe('intercrop');
    expect(stemWord('harvested')).toBe('harvest');
    expect(stemWord('categories')).toBe('category');
    expect(stemWord('class')).toBe('class');
  });

  it('keeps content words of three or more characters that are not stop words', () => {
    expect(contentWords('What is the sex of the holder?')).toEqual(['sex', 'holder']);
  });

  it('accepts terse queries whose every content word is domain vocabulary', () => {
    for (const q of ['fallow', 'holder', 'holders', 'intercropping', 'sex of holder', 'Tabulation', 'rare events']) {
      expect(isDomainVocabularyQuery(q, vocabulary), q).toBe(true);
    }
  });

  it('rejects a query with any outside word, so "population of India" cannot ride on one domain word', () => {
    expect(isDomainVocabularyQuery('holder of Nigeria', vocabulary)).toBe(false);
    expect(isDomainVocabularyQuery('fallow gdp', vocabulary)).toBe(false);
  });

  it('rejects empty queries and queries with no word of five or more characters', () => {
    expect(isDomainVocabularyQuery('what is the', vocabulary)).toBe(false);
    expect(isDomainVocabularyQuery('sex', vocabulary)).toBe(false);
  });
});

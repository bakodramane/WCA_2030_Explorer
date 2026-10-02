import { describe, expect, it } from 'vitest';
import { mentionsAll, queryEntities } from '../src/engine/entities';

describe('C3 — entity grounding', () => {
  it('finds named entities in the middle of a query and ignores the first word and possessives', () => {
    expect(queryEntities('What was Nigeria’s 2020 maize yield?')).toEqual(['nigeria']);
    expect(queryEntities('When was the last agricultural census held in Kenya?')).toEqual(['kenya']);
    expect(queryEntities('Brazil rural population')).toEqual([]);
    expect(queryEntities('How many people live in rural areas of Brazil and Peru?')).toEqual(['brazil', 'peru']);
  });

  it('ignores acronyms, structural words, and lower-case queries', () => {
    expect(queryEntities('Which types of soilless farming does Annex 4 distinguish?')).toEqual([]);
    expect(queryEntities('What does WCA 2030 say about the FAO and ISIC?')).toEqual([]);
    expect(queryEntities('Is Item 0903 an essential Theme 9 item?')).toEqual([]);
    expect(queryEntities('what is the gdp of nigeria')).toEqual([]);
  });

  it('treats a sentence after a full stop as a fresh start', () => {
    expect(queryEntities('Explain holdings. Nigeria is an example.')).toEqual([]);
  });

  it('requires every entity to appear in the text', () => {
    expect(mentionsAll('Kenyan census methods and Kenya data', ['kenya'])).toBe(true);
    expect(mentionsAll('The census of agriculture counts holdings.', ['kenya'])).toBe(false);
    expect(mentionsAll('Anything at all', [])).toBe(true);
  });
});

// tests/highlight.test.ts
// A6 acceptance: whole-word highlighting with suffix tolerance, applied to
// raw text only — never inside HTML entities, never double-escaped.
import { describe, it, expect } from 'vitest';
import { highlight } from '../src/ui/ResultCard';

describe('A6 — highlighting on word boundaries', () => {
  it('"land" does not highlight inside "inland"', () => {
    const out = highlight('Inland areas and land under temporary crops', 'land');
    expect(out).toContain('<mark>land</mark>');
    expect(out).not.toContain('<mark>inland</mark>');
    // The word "Inland" stays untouched (only the whole word "land" is marked).
    expect(out).toContain('Inland');
  });

  it('"holders" is highlighted for the query "holder" (suffix tolerance)', () => {
    const out = highlight('The number of holders and household members', 'holder');
    expect(out).toContain('<mark>holders</mark>');
  });

  it('plural and -ed/-ing suffixes are tolerated, partial stems are not', () => {
    expect(highlight('censuses and surveys', 'census')).toContain('<mark>censuses</mark>');
    expect(highlight('the counts were counted here', 'count')).toContain('<mark>counts</mark>');
    expect(highlight('the counts were counted here', 'count')).toContain('<mark>counted</mark>');
    expect(highlight('land used for farming', 'farm')).not.toContain('<mark>used</mark>');
    expect(highlight('harvested and harvesting', 'harvest')).toContain('<mark>harvested</mark>');
    expect(highlight('harvested and harvesting', 'harvest')).toContain('<mark>harvesting</mark>');
    // No match on a mid-word stem: "class" must not light up "classification".
    expect(highlight('classification systems', 'class')).not.toContain('<mark>');
  });

  it('special characters in the text are still escaped exactly once', () => {
    const out = highlight('Holdings & "parcels" <theme>', 'holdings');
    // The raw text's HTML-significant characters are escaped once, not twice.
    expect(out).toBe('<mark>Holdings</mark> &amp; &quot;parcels&quot; &lt;theme&gt;');
  });

  it('a query term equal to an HTML entity fragment never corrupts the entity', () => {
    // Old implementation escaped first, so the term "quot" could match inside
    // &quot;. Matching happens on RAW text now, so & in the text is data.
    const out = highlight('quot; is just a word here', 'quot');
    expect(out).toBe('<mark>quot</mark>; is just a word here');
  });

  it('stop words and short words are never highlighted', () => {
    const out = highlight('What is the definition of a holder?', 'what is the definition of a holder');
    expect(out).not.toContain('<mark>What</mark>');
    expect(out).not.toContain('<mark>the</mark>');
    expect(out).toContain('<mark>definition</mark>');
    expect(out).toContain('<mark>holder</mark>');
  });
});

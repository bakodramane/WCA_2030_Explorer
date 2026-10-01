// C0.2: a terse query such as "fallow", "holder" or "sex of holder" has a low semantic
// score because it carries little context, yet it is plainly about the census. A query
// counts as domain vocabulary when EVERY content word is a word of a glossary term, an
// outline title, or an item name. Requiring every word (not just one) keeps
// "population of India" out: "population" is a domain word, "India" is not.
import { STOP_WORDS } from './stopwords';

/** Light suffix stripping so "holders", "intercropped" and "intercropping" share a stem with "holder" and "intercrop". */
export function stemWord(word: string): string {
  let w = word.toLowerCase();
  if (w.length > 5 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  const verb = w.match(/^(.{4,}?)(ing|ed)$/);
  if (verb) w = verb[1].replace(/([^aeiou])\1$/, '$1'); // cropping → crop, harvested → harvest
  return w;
}

/** Lower-case tokens of three or more characters that are not stop words. */
export function contentWords(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/** Stems of the content words of each phrase (glossary terms, outline titles, item names). */
export function buildVocabulary(phrases: readonly string[]): Set<string> {
  const vocabulary = new Set<string>();
  for (const phrase of phrases) for (const word of contentWords(phrase ?? '')) vocabulary.add(stemWord(word));
  return vocabulary;
}

/** True when the query has content words, all of them domain vocabulary, and at least one of 5+ characters. */
export function isDomainVocabularyQuery(query: string, vocabulary: ReadonlySet<string>): boolean {
  const words = contentWords(query);
  return words.length > 0
    && words.some(w => w.length >= 5)
    && words.every(w => vocabulary.has(stemWord(w)));
}

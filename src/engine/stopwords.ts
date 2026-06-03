/**
 * Common English stop words shared across the retrieval engine and the UI.
 *
 * A query token qualifies as a "content word" only when it satisfies BOTH:
 *   1. length > 3  (at least 4 characters), AND
 *   2. does not appear in this set.
 *
 * Used in three places:
 *   - retrieval.ts  — BM25 `processTerm` filter, `contentWordsFromQuery`, and
 *                     the new exact-match score boost.
 *   - ResultCard.ts — term-highlighting filter so stop words are never
 *                     wrapped in <mark> tags.
 */
export const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'it','its','this','that','these','those','i','you','he','she','we',
  'they','what','which','who','whom','whose','how','when','where','why',
  'not','no','nor','so','yet','both','either','each','any','all','some',
  'more','most','other','such','as','if','than','then','there','here',
  'also','just','now','up','out','about','into','through','during',
]);

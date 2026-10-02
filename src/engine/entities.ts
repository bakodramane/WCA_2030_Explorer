// C3: entity grounding. A question that names a person, place, or organisation (Nigeria, Kenya,
// Brazil) can only be answered by text that mentions it. Embedding similarity cannot tell
// "How many farmers are there in India?" from a question about farmers in a census; a missing
// name can. Only capitalised words in the middle of the query count (acronyms and the
// document's own structural words are ignored), so lower-case queries are simply not gated.

/** Capitalised words that refer to the document's structure, not to a named entity. */
const STRUCTURAL = new Set(['annex', 'annexes', 'item', 'items', 'theme', 'themes', 'chapter', 'chapters', 'table', 'tables', 'figure', 'figures', 'section', 'paragraph', 'paragraphs', 'part', 'volume']);

/** Named-entity candidates in the query: capitalised, not all-caps, not the first word of a sentence. */
export function queryEntities(query: string): string[] {
  const entities: string[] = [];
  const pattern = /(^|[.?!]\s+)?\b([A-Z][a-z]{2,})(?:['’]s)?\b/g;
  for (const match of query.matchAll(pattern)) {
    const startsSentence = match[1] !== undefined || match.index === 0;
    const word = match[2].toLowerCase();
    if (!startsSentence && !STRUCTURAL.has(word)) entities.push(word);
  }
  return [...new Set(entities)];
}

/** True when the text mentions every entity (case-insensitive, whole-word prefix so "Kenya" matches "Kenyan"). */
export function mentionsAll(text: string, entities: readonly string[]): boolean {
  if (entities.length === 0) return true;
  const lower = text.toLowerCase();
  return entities.every(e => new RegExp(`\\b${e}`).test(lower));
}

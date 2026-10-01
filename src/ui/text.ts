// Text helpers shared by every card and modal (E3: single home for what App, ResultCard and qa-block each defined).
import { STOP_WORDS } from '../engine/stopwords';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Term highlighting (A6): whole-word matching with simple suffix tolerance, applied to the RAW text
// BEFORE escaping, so a term is never highlighted inside an HTML entity and nothing is double-escaped.
// Only content words count (length >= 4, not a stop word); "land" does not light up inside "inland",
// while the query "holder" still highlights "holders".
export function highlight(text: string, query: string): string {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter(t => t.length >= 4 && !STOP_WORDS.has(t));
  if (tokens.length === 0) return esc(text);

  // Longest first so longer query words win over their shorter prefixes.
  const terms = [...new Set(tokens)].sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${terms.map(escRe).join('|')})(s|es|ed|ing)?\\b`, 'gi');

  let out  = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(last, m.index!));
    out += `<mark>${esc(m[0])}</mark>`;
    last = m.index! + m[0].length;
  }
  return out + esc(text.slice(last));
}

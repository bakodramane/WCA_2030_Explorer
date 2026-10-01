import { normaliseForMatch } from './normalise';
import type { SourceText } from './source-text';

export interface SourceToken {
  key: string;
  display: string;
  page: number;
}

export interface SourceIndex {
  tokens: SourceToken[];
  grams: Map<string, number[]>;
}

export interface Repair {
  text: string;
  page: number;
  method: 'furniture-removed' | 'passage-match' | 'joined-passages';
  /** Share of the original excerpt's words found in the replacement passage. */
  coverage: number;
  /** Replacement length divided by original length (in words). */
  lengthRatio: number;
  confidence: 'high' | 'low';
}

const GRAM = 4;
const MAX_GRAM_HITS = 40;
/** Votes must agree on position − word index within this many words (allows page furniture). */
const DIAGONAL_WINDOW = 25;
const MAX_EXPANSION = 45;
/** Extra clusters join the best one only when they lie this close (in words). */
const JOIN_GAP = 150;
const MAX_JOINS = 3;
const MIN_JOIN_WORDS = 6;
/** A joined span longer than this falls back to the best single passage. */
const MAX_JOINED_WORDS = 400;
const MAX_CONFIDENT_RATIO = 2;

export function wordKey(word: string): string {
  return normaliseForMatch(word).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Split into words; punctuation-only tokens (bullets, dashes) stay attached to a neighbour. */
function toWords(text: string): Array<{ key: string; display: string }> {
  const words: Array<{ key: string; display: string }> = [];
  let carry = '';
  for (const display of text.split(/\s+/).filter(Boolean)) {
    const key = wordKey(display);
    if (key) {
      words.push({ key, display: carry ? `${carry} ${display}` : display });
      carry = '';
    } else if (words.length > 0 && !carry && !/^[\u2022]$/.test(display)) {
      words[words.length - 1].display += ` ${display}`;
    } else carry = carry ? `${carry} ${display}` : display;
  }
  if (carry && words.length > 0) words[words.length - 1].display += ` ${carry}`;
  return words;
}

export function buildSourceIndex(source: SourceText): SourceIndex {
  const tokens: SourceToken[] = [];
  const nums = [...source.displayPages.keys()].sort((a, b) => a - b);
  for (const page of nums) {
    for (const word of toWords(source.displayPages.get(page) ?? '')) tokens.push({ ...word, page });
  }
  const grams = new Map<string, number[]>();
  for (let i = 0; i + GRAM <= tokens.length; i++) {
    const gram = tokens.slice(i, i + GRAM).map(t => t.key).join(' ');
    const list = grams.get(gram);
    if (list) list.push(i); else grams.set(gram, [i]);
  }
  return { tokens, grams };
}

function isTerminal(display: string): boolean {
  return /[.?!]["'”’)\]]*$/.test(display) && !/^(e\.g|i\.e|etc|no|vs)\.$/i.test(display);
}

function startsSentence(display: string): boolean {
  return /^(["'“‘(•]|[A-Z0-9])/.test(display);
}

interface Located { start: number; end: number; hits: number; clusters: number; single: { start: number; end: number; hits: number } }

/**
 * Locate the best contiguous source span for an excerpt via 4-gram diagonal voting.
 * Curated excerpts were sometimes stitched from nearby sentences, so further
 * clusters within JOIN_GAP words of the best one extend the span.
 */
function locate(index: SourceIndex, words: Array<{ key: string }>): Located | null {
  let votes: Array<{ i: number; p: number }> = [];
  for (let i = 0; i + GRAM <= words.length; i++) {
    const positions = index.grams.get(words.slice(i, i + GRAM).map(w => w.key).join(' '));
    if (!positions || positions.length > MAX_GRAM_HITS) continue;
    for (const p of positions) votes.push({ i, p });
  }
  if (votes.length === 0) return null;

  const covered = new Set<number>();
  const newWords = (cluster: typeof votes): number => {
    const fresh = new Set<number>();
    for (const v of cluster) for (let k = 0; k < GRAM; k++) if (!covered.has(v.i + k)) fresh.add(v.i + k);
    return fresh.size;
  };
  const bestCluster = (pool: typeof votes): typeof votes => {
    let best: typeof votes = [];
    let bestScore = 0;
    for (const anchor of pool) {
      const diagonal = anchor.p - anchor.i;
      const cluster = pool.filter(v => Math.abs(v.p - v.i - diagonal) <= DIAGONAL_WINDOW);
      const score = newWords(cluster);
      if (score > bestScore) { best = cluster; bestScore = score; }
    }
    return best;
  };

  let chosen = bestCluster(votes);
  let start = Math.min(...chosen.map(v => v.p));
  let end = Math.max(...chosen.map(v => v.p)) + GRAM - 1;
  for (const v of chosen) for (let k = 0; k < GRAM; k++) covered.add(v.i + k);
  let clusters = 1;
  const single = { start, end, hits: covered.size };

  for (let round = 0; round < MAX_JOINS; round++) {
    const chosenSet = new Set(chosen);
    votes = votes.filter(v => !chosenSet.has(v) && v.p >= start - JOIN_GAP && v.p <= end + JOIN_GAP);
    chosen = bestCluster(votes);
    if (chosen.length === 0 || newWords(chosen) < MIN_JOIN_WORDS) break;
    start = Math.min(start, ...chosen.map(v => v.p));
    end = Math.max(end, Math.max(...chosen.map(v => v.p)) + GRAM - 1);
    for (const v of chosen) for (let k = 0; k < GRAM; k++) covered.add(v.i + k);
    clusters++;
  }
  return { start, end, hits: covered.size, clusters, single };
}

/** Widen to whole sentences; an edge with no boundary within MAX_EXPANSION words is left as matched. */
function expandToSentences(tokens: SourceToken[], start: number, end: number): [number, number] {
  let from = start;
  let found = false;
  for (let n = 0; n <= MAX_EXPANSION && from >= 0; n++, from--) {
    if (from === 0 || (isTerminal(tokens[from - 1].display) && startsSentence(tokens[from].display))) { found = true; break; }
  }
  if (!found) from = start;

  let to = end;
  found = false;
  for (let n = 0; n <= MAX_EXPANSION && to < tokens.length; n++, to++) {
    if (isTerminal(tokens[to].display) || to === tokens.length - 1) { found = true; break; }
  }
  if (!found) to = end;
  return [from, to];
}

const FURNITURE_WORD = /^(\d{1,3}|[A-Z]{2,}[A-Z:,&-]*)$/;

function withoutFurniture(displays: string[]): string[] {
  return displays.filter(d => !FURNITURE_WORD.test(d)).map(wordKey).filter(Boolean);
}

/** Replace a non-verbatim excerpt with the best-matching verbatim passage, or null if none exists. */
export function repairExcerpt(index: SourceIndex, excerpt: string): Repair | null {
  const words = toWords(excerpt);
  let found = locate(index, words);
  if (!found) return null;
  if (found.clusters > 1 && found.end - found.start + 1 > MAX_JOINED_WORDS) {
    found = { ...found, ...found.single, clusters: 1 };
  }

  const raw = index.tokens.slice(found.start, found.end + 1);
  const rawWords = raw.map(t => t.display);
  const sameAfterFurniture =
    withoutFurniture(words.map(w => w.display)).join(' ') === withoutFurniture(rawWords).join(' ');

  const method: Repair['method'] = sameAfterFurniture
    ? 'furniture-removed'
    : found.clusters > 1 ? 'joined-passages' : 'passage-match';
  const [from, to] = expandToSentences(index.tokens, found.start, found.end);

  const span = index.tokens.slice(from, to + 1);
  const coverage = Math.min(1, found.hits / words.length);
  const lengthRatio = span.length / words.length;
  const confident = method === 'furniture-removed' || (coverage >= 0.85 && lengthRatio >= 0.7 && lengthRatio <= MAX_CONFIDENT_RATIO);
  return {
    text: span.map(t => t.display).join(' '),
    page: span[0].page,
    method,
    coverage: Number(coverage.toFixed(2)),
    lengthRatio: Number(lengthRatio.toFixed(2)),
    confidence: confident ? 'high' : 'low',
  };
}

// C0.4: all-MiniLM-L6-v2 was trained on inputs of at most 256 tokens (Transformers.js truncates
// at 512), so a 350-word chunk (~377 tokens on average) cannot be embedded whole. Each chunk is
// embedded as several windows of at most MAX_WINDOW_TOKENS, aligned to sentence boundaries, and
// a chunk is scored by its best window.

export const WINDOW_SCHEME = 'sent-w200-v1';
export const MAX_WINDOW_TOKENS = 200;
/** The previous window's last sentence is repeated at the start of the next one when it is this short. */
const OVERLAP_MAX_TOKENS = 40;
/** A short final window is folded into the previous one when the result stays under this size. */
const MIN_TAIL_TOKENS = 30;
const MERGE_TAIL_LIMIT = 240;

export interface TextWindow {
  /** Character offsets into the chunk text: text.slice(start, end). */
  start: number;
  end: number;
  tokens: number;
}

interface Word { start: number; end: number; tokens: number }
interface Sentence { first: number; last: number; tokens: number }

const ABBREVIATION = /^(e\.g|i\.e|etc|no|vs|fig|pp?|cf|approx)\.$/i;

function wordsOf(text: string, countTokens: (word: string) => number): Word[] {
  const words: Word[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    words.push({ start: match.index!, end: match.index! + match[0].length, tokens: countTokens(match[0]) });
  }
  return words;
}

/** Group word indices into sentences; every bullet starts a new one. */
function sentencesOf(text: string, words: Word[]): Sentence[] {
  const sentences: Sentence[] = [];
  let first = 0;
  const close = (last: number): void => {
    const tokens = words.slice(first, last + 1).reduce((sum, w) => sum + w.tokens, 0);
    sentences.push({ first, last, tokens });
    first = last + 1;
  };
  for (let i = 0; i < words.length - 1; i++) {
    const current = text.slice(words[i].start, words[i].end);
    const next = text.slice(words[i + 1].start, words[i + 1].end);
    const endsSentence = /[.?!]["'”’)\]]*$/.test(current) && !ABBREVIATION.test(current)
      && /^["'“‘(•A-Z0-9]/.test(next);
    if (endsSentence || next.startsWith('•')) close(i);
  }
  if (words.length > 0) close(words.length - 1);
  return sentences;
}

/** Cut a sentence longer than the window (tables, code lists) into word runs that fit. */
function splitLong(sentence: Sentence, words: Word[]): Sentence[] {
  if (sentence.tokens <= MAX_WINDOW_TOKENS) return [sentence];
  const parts: Sentence[] = [];
  let first = sentence.first;
  let tokens = 0;
  for (let i = sentence.first; i <= sentence.last; i++) {
    if (tokens + words[i].tokens > MAX_WINDOW_TOKENS && i > first) {
      parts.push({ first, last: i - 1, tokens });
      first = i;
      tokens = 0;
    }
    tokens += words[i].tokens;
  }
  parts.push({ first, last: sentence.last, tokens });
  return parts;
}

/** Split a chunk's text into windows of at most MAX_WINDOW_TOKENS (a lone token run may be longer only if one word is). */
export function makeWindows(text: string, countTokens: (word: string) => number): TextWindow[] {
  const words = wordsOf(text, countTokens);
  const sentences = sentencesOf(text, words).flatMap(s => splitLong(s, words));
  const groups: Sentence[][] = [];
  let group: Sentence[] = [];
  let tokens = 0;

  for (const sentence of sentences) {
    if (group.length > 0 && tokens + sentence.tokens > MAX_WINDOW_TOKENS) {
      groups.push(group);
      const tail = group[group.length - 1];
      const overlap = group.length > 1 && tail.tokens <= OVERLAP_MAX_TOKENS ? [tail] : [];
      group = overlap;
      tokens = overlap.reduce((sum, s) => sum + s.tokens, 0);
    }
    group.push(sentence);
    tokens += sentence.tokens;
  }
  if (group.length > 0) groups.push(group);

  const toWindow = (g: Sentence[]): TextWindow => ({
    start: words[g[0].first].start,
    end: words[g[g.length - 1].last].end,
    tokens: g.reduce((sum, s) => sum + s.tokens, 0),
  });
  const windows = groups.map(toWindow);

  const last = windows[windows.length - 1];
  const previous = windows[windows.length - 2];
  if (last && previous && last.tokens < MIN_TAIL_TOKENS && previous.tokens + last.tokens <= MERGE_TAIL_LIMIT) {
    windows.splice(-2, 2, { start: previous.start, end: last.end, tokens: previous.tokens + last.tokens });
  }
  return windows;
}

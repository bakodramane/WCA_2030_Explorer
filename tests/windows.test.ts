import { describe, expect, it } from 'vitest';
import { MAX_WINDOW_TOKENS, makeWindows } from '../scripts/lib/windows';

/** One token per word keeps the arithmetic obvious. */
const oneEach = (): number => 1;

function sentence(n: number, words: number): string {
  return `S${n} ${Array.from({ length: words - 1 }, (_, i) => `w${i}`).join(' ')}.`;
}

describe('C0.4 — window splitting', () => {
  it('keeps a short chunk as one window covering the whole text', () => {
    const text = `${sentence(1, 20)} ${sentence(2, 20)}`;
    const windows = makeWindows(text, oneEach);
    expect(windows).toEqual([{ start: 0, end: text.length, tokens: 40 }]);
  });

  it('never exceeds the token limit and covers every word', () => {
    const text = Array.from({ length: 14 }, (_, i) => sentence(i + 1, 45)).join(' ');
    const windows = makeWindows(text, oneEach);
    expect(windows.length).toBeGreaterThan(2);
    for (const w of windows) expect(w.tokens).toBeLessThanOrEqual(MAX_WINDOW_TOKENS);
    expect(windows[0].start).toBe(0);
    expect(windows[windows.length - 1].end).toBe(text.length);
    for (let i = 1; i < windows.length; i++) expect(windows[i].start).toBeLessThanOrEqual(windows[i - 1].end + 1); // at most the joining space
  });

  it('breaks at sentence boundaries and repeats a short closing sentence as overlap', () => {
    const text = [sentence(1, 90), sentence(2, 90), sentence(3, 30), sentence(4, 90)].join(' ');
    const [first, second] = makeWindows(text, oneEach);
    expect(text.slice(first.start, first.end).endsWith('.')).toBe(true);
    expect(text.slice(second.start, second.end).startsWith('S3 ')).toBe(true);
  });

  it('splits a sentence longer than the limit into word runs (tables, code lists)', () => {
    const text = Array.from({ length: 450 }, (_, i) => `c${i}`).join(' ');
    const windows = makeWindows(text, oneEach);
    expect(windows.map(w => w.tokens)).toEqual([200, 200, 50]);
  });

  it('starts a new sentence at every bullet', () => {
    const bullets = Array.from({ length: 6 }, (_, i) => `• item ${i} ${'x '.repeat(38)}`).join('');
    const windows = makeWindows(bullets, oneEach);
    for (const w of windows) expect(bullets.slice(w.start, w.end).startsWith('•')).toBe(true);
  });

  it('does not treat abbreviations as sentence ends', () => {
    const text = `Crops, e.g. Wheat and barley, are counted. ${'filler '.repeat(210)}end.`;
    const [first] = makeWindows(text, oneEach);
    expect(text.slice(first.start, first.end)).toContain('e.g. Wheat');
  });

  it('folds a very short final window into the previous one while staying under 240 tokens', () => {
    const text = `${sentence(1, 150)} ${sentence(2, 45)} ${sentence(3, 20)}`;
    const windows = makeWindows(text, oneEach);
    expect(windows).toEqual([{ start: 0, end: text.length, tokens: 215 }]);
  });

  it('returns no windows for empty text', () => {
    expect(makeWindows('   ', oneEach)).toEqual([]);
  });
});

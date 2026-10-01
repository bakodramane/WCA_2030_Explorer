// C0.4: every chunk is embedded as windows that fit the model's 256-token training length.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { AutoTokenizer, env } from '@xenova/transformers';
import { WINDOW_SCHEME } from '../scripts/lib/windows';
import type { Chunk } from '../src/engine/types';

(env as Record<string, unknown>).localModelPath = path.join(process.cwd(), 'public', 'models') + path.sep;
(env as Record<string, unknown>).allowRemoteModels = false;

describe('C0.4 — windowed chunk embeddings', () => {
  let chunks: Chunk[] = [];
  let tokens: (text: string) => number = () => 0;

  beforeAll(async () => {
    chunks = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'chunks.json'), 'utf-8')) as Chunk[];
    const tokenizer = await AutoTokenizer.from_pretrained('Xenova/all-MiniLM-L6-v2');
    tokens = text => (tokenizer(text, { add_special_tokens: false }).input_ids.data as ArrayLike<unknown>).length;
  }, 60_000);

  it('every chunk carries windows from the current scheme and no legacy whole-chunk vector', () => {
    for (const chunk of chunks) {
      expect(chunk.windows?.length, chunk.id).toBeGreaterThan(0);
      expect((chunk as unknown as { windowScheme: string }).windowScheme, chunk.id).toBe(WINDOW_SCHEME);
      expect(chunk.embedding, chunk.id).toBeUndefined();
    }
  });

  it('windows are unit vectors of dimension 384 that tile the chunk text', () => {
    for (const chunk of chunks) {
      const windows = chunk.windows!;
      expect(windows[0].start, chunk.id).toBe(0);
      expect(windows[windows.length - 1].end, chunk.id).toBe(chunk.text.length);
      for (const [i, w] of windows.entries()) {
        expect(w.embedding, chunk.id).toHaveLength(384);
        const norm = Math.sqrt(w.embedding.reduce((sum, x) => sum + x * x, 0));
        expect(Math.abs(norm - 1), `${chunk.id} window ${i}`).toBeLessThan(1e-3);
        if (i > 0) expect(w.start, chunk.id).toBeLessThanOrEqual(windows[i - 1].end + 1);
      }
    }
  });

  it('no window exceeds 240 tokens (the model was trained on 256, including two special tokens)', () => {
    let longest = 0;
    for (const chunk of chunks) {
      for (const w of chunk.windows!) {
        const count = tokens(chunk.text.slice(w.start, w.end));
        longest = Math.max(longest, count);
        expect(count, `${chunk.id} [${w.start}, ${w.end})`).toBeLessThanOrEqual(240);
      }
    }
    expect(longest).toBeGreaterThan(100);
  });
});

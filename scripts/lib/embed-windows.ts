import { AutoTokenizer, pipeline } from '@xenova/transformers';
import { makeWindows, WINDOW_SCHEME, type TextWindow } from './windows';

export const MODEL = 'Xenova/all-MiniLM-L6-v2';
export const DIM = 384;
const BATCH_SIZE = 32;
const CHECKPOINT_EVERY = 256;

export interface EmbeddedWindow extends Pick<TextWindow, 'start' | 'end'> {
  embedding: number[];
}

export interface WindowedChunk {
  text: string;
  windowScheme?: string;
  windows?: EmbeddedWindow[];
}

/** Float32 values printed with 9 significant digits round-trip exactly and keep the JSON small. */
export function compactVector(values: ArrayLike<number>): number[] {
  return Array.from(values, value => Number(value.toPrecision(9)));
}

/**
 * Give every chunk `windowScheme` and `windows`. Chunks whose text and scheme are
 * unchanged keep their previous vectors; the rest are windowed, then embedded offline.
 * `onCheckpoint` receives all chunks (finished ones carry windows) so a crash can resume.
 */
export async function embedChunkWindows<T extends WindowedChunk>(
  chunks: T[],
  previous: T[],
  onCheckpoint: (chunks: T[]) => void,
): Promise<{ chunks: T[]; reused: number; embedded: number; windows: number }> {
  const reusable = new Map(
    previous.filter(c => c.windowScheme === WINDOW_SCHEME && c.windows?.length).map(c => [c.text, c]),
  );
  const result: T[] = chunks.map(chunk => {
    const old = reusable.get(chunk.text);
    return old ? { ...chunk, windowScheme: WINDOW_SCHEME, windows: old.windows } : { ...chunk, windows: undefined };
  });
  const todo = result.filter(chunk => !chunk.windows);
  const reused = result.length - todo.length;
  if (todo.length === 0) {
    console.log('All chunks already embedded — skipping model load.');
    return { chunks: result, reused, embedded: 0, windows: 0 };
  }

  console.log(`Loading tokenizer and model: ${MODEL} (offline)`);
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
  const extractor = await pipeline('feature-extraction', MODEL);
  const tokenCache = new Map<string, number>();
  const countTokens = (word: string): number => {
    let count = tokenCache.get(word);
    if (count === undefined) {
      count = (tokenizer(word, { add_special_tokens: false }).input_ids.data as ArrayLike<unknown>).length;
      tokenCache.set(word, count);
    }
    return count;
  };

  const pending = todo.flatMap(chunk =>
    makeWindows(chunk.text, countTokens).map(w => ({ chunk, start: w.start, end: w.end })),
  );
  const done = new Map<T, EmbeddedWindow[]>(todo.map(chunk => [chunk, []]));
  const expected = new Map<T, number>(todo.map(chunk => [chunk, pending.filter(p => p.chunk === chunk).length]));
  const started = Date.now();

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const output = await (extractor as any)(batch.map(w => w.chunk.text.slice(w.start, w.end)), { pooling: 'mean', normalize: true });
    const data: Float32Array = output.data;
    batch.forEach((w, j) => {
      done.get(w.chunk)!.push({ start: w.start, end: w.end, embedding: compactVector(data.subarray(j * DIM, (j + 1) * DIM)) });
    });
    for (const chunk of todo) {
      if (!chunk.windows && done.get(chunk)!.length === expected.get(chunk)) {
        chunk.windows = done.get(chunk);
        chunk.windowScheme = WINDOW_SCHEME;
      }
    }
    const finished = Math.min(i + BATCH_SIZE, pending.length);
    if (Math.floor(finished / CHECKPOINT_EVERY) > Math.floor(i / CHECKPOINT_EVERY) || finished === pending.length) {
      console.log(`  [${finished}/${pending.length}] windows  ${((Date.now() - started) / 1000).toFixed(1)}s`);
      onCheckpoint(result);
    }
  }
  return { chunks: result, reused, embedded: todo.length, windows: pending.length };
}

// E1: embeddings live in binary files (Float32, row-major, 384 per row) beside compact JSON, so the
// browser reads them with fetch().arrayBuffer() and Float32Array views instead of parsing ~10 MB of JSON.
import fs from 'node:fs';
import path from 'node:path';

export const DIM = 384;
export const CHUNK_EMBEDDINGS = 'embeddings.f32';
export const QA_EMBEDDINGS = 'qa-embeddings.f32';

export function writeEmbeddings(file: string, rows: ArrayLike<number>[]): void {
  const out = new Float32Array(rows.length * DIM);
  rows.forEach((row, i) => {
    if (row.length !== DIM) throw new Error(`Embedding ${i} has ${row.length} values, expected ${DIM}`);
    out.set(row as ArrayLike<number> as number[], i * DIM);
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(out.buffer));
}

/** Rows of a binary embeddings file, or null when it does not exist. */
export function readEmbeddings(file: string): Float32Array[] | null {
  if (!fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  const all = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  return Array.from({ length: all.length / DIM }, (_, i) => all.subarray(i * DIM, (i + 1) * DIM));
}

interface WithWindows { windows?: Array<{ start: number; end: number; embedding?: number[] }> }

/** Remove window embeddings from chunks; returns the chunks and the rows in chunk/window order. */
export function splitChunkEmbeddings<T extends WithWindows>(chunks: T[]): { chunks: T[]; rows: number[][] } {
  const rows: number[][] = [];
  const stripped = chunks.map(chunk => ({
    ...chunk,
    windows: chunk.windows?.map(w => { rows.push(w.embedding!); return { start: w.start, end: w.end }; }),
  }));
  return { chunks: stripped as T[], rows };
}

/** Inverse of splitChunkEmbeddings: put rows back as `embedding` arrays (for resuming and tests). */
export function joinChunkEmbeddings<T extends WithWindows>(chunks: T[], rows: ArrayLike<number>[]): T[] {
  let next = 0;
  return chunks.map(chunk => ({
    ...chunk,
    windows: chunk.windows?.map(w => ({ start: w.start, end: w.end, embedding: Array.from(rows[next++]) })),
  })) as T[];
}

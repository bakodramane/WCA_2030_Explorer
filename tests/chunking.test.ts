import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

interface Chunk {
  id: string;
  sectionTitle: string;
  pageRef: number;
  text: string;
  priority: 'high' | 'normal';
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const chunksPath = path.join(process.cwd(), 'src', 'data', 'chunks-raw.json');

describe('chunking', () => {
  let chunks: Chunk[] = [];

  beforeAll(() => {
    const raw = fs.readFileSync(chunksPath, 'utf-8');
    chunks = JSON.parse(raw) as Chunk[];
  });

  it('total chunk count is between 800 and 6000', () => {
    expect(chunks.length).toBeGreaterThanOrEqual(800);
    expect(chunks.length).toBeLessThanOrEqual(6000);
  });

  it('no chunk exceeds 420 words', () => {
    for (const chunk of chunks) {
      const wc = wordCount(chunk.text);
      expect(wc, `Chunk ${chunk.id} has ${wc} words`).toBeLessThanOrEqual(420);
    }
  });

  it('every chunk has a non-empty sectionTitle and a positive pageRef', () => {
    for (const chunk of chunks) {
      expect(
        chunk.sectionTitle.trim().length,
        `Chunk ${chunk.id} has empty sectionTitle`,
      ).toBeGreaterThan(0);
      expect(
        chunk.pageRef,
        `Chunk ${chunk.id} has non-positive pageRef`,
      ).toBeGreaterThan(0);
    }
  });

  it('at least 10% of chunks carry priority: high', () => {
    const highCount = chunks.filter(c => c.priority === 'high').length;
    const ratio = highCount / chunks.length;
    expect(ratio, `Only ${(ratio * 100).toFixed(1)}% are high-priority`).toBeGreaterThanOrEqual(0.1);
  });

  it('all chunk IDs are unique', () => {
    const ids = chunks.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

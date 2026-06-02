import { describe, it, expect, beforeAll, vi } from 'vitest';

// vi.mock is hoisted by Vitest's transformer, so the mock is in place
// before retrieval.ts module-level code (env property assignments) runs.
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
  env: {} as Record<string, unknown>,
}));

import { RetrievalEngine } from '../src/engine/retrieval';
import { pipeline } from '@xenova/transformers';

// ── Test constants ─────────────────────────────────────────────────────────────

const DIM = 384;

/** Build a DIM-length number[] with specific leading values, rest 0. */
function makeEmbedding(...leading: number[]): number[] {
  const arr = new Array<number>(DIM).fill(0);
  leading.forEach((v, i) => { arr[i] = v; });
  return arr;
}

// ── Mock data ──────────────────────────────────────────────────────────────────
//
// Mock extractor always returns query vec: [0.8, 0, 0, …]
//
// Dot products (query · chunk):
//   A: 0.8 × 0.8 = 0.640   priority normal → score 0.640
//   B: 0.8 × 0.0 = 0.000   priority normal → score 0.000
//   C: 0.8 × 0.7 = 0.560   priority HIGH   → score 0.560 × 1.15 = 0.644
//
// Expected ranking after boost: C (0.644) > A (0.640) > B (0.000)
// Without boost it would be:   A (0.640) > C (0.560) > B (0.000)
// — the boost must flip positions 1 and 2.

const MOCK_CHUNKS = [
  {
    id: 'a',
    sectionTitle: 'AGRICULTURAL HOLDINGS',
    pageRef: 10,
    text: 'agricultural holdings definition scope census methodology',
    priority: 'normal' as const,
    embedding: makeEmbedding(0.8),
  },
  {
    id: 'b',
    sectionTitle: 'LAND USE',
    pageRef: 20,
    text: 'land use classification arable permanent crops pasture',
    priority: 'normal' as const,
    embedding: makeEmbedding(0),
  },
  {
    id: 'c',
    sectionTitle: 'ESSENTIAL ITEMS',
    pageRef: 110,
    text: 'essential items holdings agricultural census methodology scope',
    priority: 'high' as const,
    embedding: makeEmbedding(0.7),
  },
];

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('RetrievalEngine', () => {
  let engine: RetrievalEngine;

  beforeAll(async () => {
    // Stub fetch → returns the controlled chunk dataset
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve(structuredClone(MOCK_CHUNKS)),
    }));

    // Stub pipeline → returns a mock extractor that always yields [0.8, 0, …]
    const QUERY_VEC = new Float32Array(DIM); // all zeros
    QUERY_VEC[0] = 0.8;
    const mockExtractor = vi.fn().mockResolvedValue({ data: QUERY_VEC });
    vi.mocked(pipeline).mockResolvedValue(mockExtractor as never);

    engine = new RetrievalEngine();
    await engine.init();
  });

  // ── Test 1: ranking order ──────────────────────────────────────────────────

  it('semanticSearch returns results sorted by score descending', async () => {
    const results = await engine.semanticSearch('any query', 3);

    expect(results).toHaveLength(3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
    expect(results.every(r => r.matchType === 'semantic')).toBe(true);
  });

  // ── Test 2: 1.15× boost changes the ranking ────────────────────────────────

  it('applies 1.15× boost to high-priority chunks and changes ranking', async () => {
    const results = await engine.semanticSearch('any query', 3);

    const resA = results.find(r => r.chunk.id === 'a')!;
    const resC = results.find(r => r.chunk.id === 'c')!;

    // Exact score assertions
    expect(resA.score).toBeCloseTo(0.8 * 0.8,        5); // 0.640
    expect(resC.score).toBeCloseTo(0.8 * 0.7 * 1.15, 5); // 0.644

    // Boost must have promoted C above A
    expect(results[0].chunk.id).toBe('c');
    expect(results[1].chunk.id).toBe('a');
    expect(results[2].chunk.id).toBe('b');
  });

  // ── Test 3: lexical search ─────────────────────────────────────────────────

  it('lexicalSearch returns relevant results with matchType lexical', () => {
    const results = engine.lexicalSearch('agricultural holdings', 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results.every(r => r.matchType === 'lexical')).toBe(true);

    // "agricultural holdings" appears in both chunk A and chunk C text
    expect(results.some(r => r.chunk.id === 'a')).toBe(true);
  });

  // ── Test 4: topK is respected ──────────────────────────────────────────────

  it('semanticSearch respects the topK limit', async () => {
    const top1 = await engine.semanticSearch('query', 1);
    expect(top1).toHaveLength(1);
    expect(top1[0].chunk.id).toBe('c'); // highest score after boost
  });
});

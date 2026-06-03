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

// ── Section-level mock data ────────────────────────────────────────────────────
//
// Query vec is always [0.8, 0, …], so chunk score = embedding[0] × 0.8.
//
// Section scores (all priority:'normal', so no HIGH_PRIORITY_K boost):
//   SECTION X  — 3 chunks, each embedding[0]=0.375 → score 0.3  each  → avg 0.3
//   SECTION Y  — 1 chunk,       embedding[0]=0.6   → score 0.48       → avg 0.48
//   SECTION Z  — 2 chunks,      embedding[0]=0.5/0.3 → 0.4/0.24      → avg 0.32
//   BIG SECTION — 2 chunks,     embedding[0]=0.8   → score 0.64 each  → EXCLUDED (span 49 > 40)
//   ESSENTIAL ITEMS — 1 chunk,  embedding[0]=0.52  → score 0.416      → avg 0.416
//      boosted for "essential items" query: 0.416 × 1.25 = 0.52
//   OTHER DATA  — 1 chunk,      embedding[0]=0.55  → score 0.44       → avg 0.44
//      boosted for "data census"     query: 0.44  × 1.25 = 0.55

const SECTION_MOCK_CHUNKS = [
  // FRONT MATTER: spans pp.1–5 (pageEnd=5 ≤ 10 → excluded as front matter).
  // High embedding similarity (0.9) ensures it would dominate if not filtered.
  { id: 'fm1', sectionTitle: 'FRONT MATTER', pageRef: 1, text: 'table of contents essential items list census', priority: 'normal' as const, embedding: makeEmbedding(0.9) },
  { id: 'fm2', sectionTitle: 'FRONT MATTER', pageRef: 5, text: 'list of items for the census essential',        priority: 'normal' as const, embedding: makeEmbedding(0.9) },

  // SECTION X: 3 chunks (avg=0.3). Sum would be 0.9 — used in Fix 1 test.
  // pageRef=15 so pageEnd=15 > 10 (not excluded by front-matter guard).
  { id: 'sx1', sectionTitle: 'SECTION X', pageRef: 15, text: 'section x chunk one agricultural holdings', priority: 'normal' as const, embedding: makeEmbedding(0.375) },
  { id: 'sx2', sectionTitle: 'SECTION X', pageRef: 15, text: 'section x chunk two land use data',         priority: 'normal' as const, embedding: makeEmbedding(0.375) },
  { id: 'sx3', sectionTitle: 'SECTION X', pageRef: 15, text: 'section x chunk three census methodology',  priority: 'normal' as const, embedding: makeEmbedding(0.375) },

  // SECTION Y: 1 chunk (avg=0.48 > SECTION X avg=0.3). Fix 1.
  { id: 'sy1', sectionTitle: 'SECTION Y', pageRef: 20, text: 'section y single chunk high quality',       priority: 'normal' as const, embedding: makeEmbedding(0.6) },

  // SECTION Z: 2 chunks (avg=(0.4+0.24)/2=0.32). Fix 1 two-chunk test.
  { id: 'sz1', sectionTitle: 'SECTION Z', pageRef: 30, text: 'section z first chunk items holdings',      priority: 'normal' as const, embedding: makeEmbedding(0.5) },
  { id: 'sz2', sectionTitle: 'SECTION Z', pageRef: 31, text: 'section z second chunk data census',        priority: 'normal' as const, embedding: makeEmbedding(0.3) },

  // BIG SECTION: spans pp.1–50 (span=49 > 40 → excluded by Fix 2b).
  // Individual chunk scores (0.64) are highest of any section in the set.
  // pageEnd=50 > 10, so not caught by front-matter guard — Fix 2b excludes it.
  { id: 'bg1', sectionTitle: 'BIG SECTION', pageRef:  1, text: 'big section start high relevance', priority: 'normal' as const, embedding: makeEmbedding(0.8) },
  { id: 'bg2', sectionTitle: 'BIG SECTION', pageRef: 50, text: 'big section end high relevance',   priority: 'normal' as const, embedding: makeEmbedding(0.8) },

  // ESSENTIAL ITEMS: title matches "essential items" query → boost. Fix 3.
  { id: 'es1', sectionTitle: 'ESSENTIAL ITEMS', pageRef: 64, text: 'essential items agricultural census methodology', priority: 'normal' as const, embedding: makeEmbedding(0.52) },

  // OTHER DATA: title contains "data" (4 chars, not stop word) → boosted by
  // "data census" query but not by "essential items" query. Fix 3.
  { id: 'od1', sectionTitle: 'OTHER DATA', pageRef: 70, text: 'other agricultural data collection',  priority: 'normal' as const, embedding: makeEmbedding(0.55) },
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

// ── Section methods test suite (26 tests) ─────────────────────────────────────

describe('RetrievalEngine — section methods', () => {
  let sectionEngine: RetrievalEngine;

  beforeAll(async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve(structuredClone(SECTION_MOCK_CHUNKS)),
    }));
    const vec = new Float32Array(DIM); vec[0] = 0.8;
    const mockExt = vi.fn().mockResolvedValue({ data: vec });
    vi.mocked(pipeline).mockResolvedValue(mockExt as never);

    sectionEngine = new RetrievalEngine();
    await sectionEngine.init();
  });

  // ── debugSectionIndex (tests 1–7) ─────────────────────────────────────────

  describe('debugSectionIndex', () => {
    it('returns one entry per unique sectionTitle (capped at 10)', () => {
      const result = sectionEngine.debugSectionIndex();
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(10);
      // SECTION_MOCK_CHUNKS has 7 distinct sections → all 7 returned
      expect(result.length).toBe(7);
    });

    it('entries are sorted by chunkCount descending', () => {
      const result = sectionEngine.debugSectionIndex();
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].chunkCount).toBeGreaterThanOrEqual(result[i].chunkCount);
      }
      // SECTION X (3 chunks) must come first
      expect(result[0].sectionTitle).toBe('SECTION X');
    });

    it('each entry contains all required fields', () => {
      const result = sectionEngine.debugSectionIndex();
      for (const e of result) {
        expect(typeof e.sectionId).toBe('string');
        expect(typeof e.sectionTitle).toBe('string');
        expect(typeof e.chunkCount).toBe('number');
        expect(typeof e.pageStart).toBe('number');
        expect(typeof e.pageEnd).toBe('number');
      }
    });

    it('chunkCount equals the actual number of chunks in each section', () => {
      const result = sectionEngine.debugSectionIndex();
      const x = result.find(e => e.sectionTitle === 'SECTION X')!;
      const y = result.find(e => e.sectionTitle === 'SECTION Y')!;
      const z = result.find(e => e.sectionTitle === 'SECTION Z')!;
      expect(x.chunkCount).toBe(3);
      expect(y.chunkCount).toBe(1);
      expect(z.chunkCount).toBe(2);
    });

    it('pageStart equals the minimum pageRef across the section\'s chunks', () => {
      const result = sectionEngine.debugSectionIndex();
      // SECTION Z has chunks on pages 30 and 31 → pageStart = 30
      const z   = result.find(e => e.sectionTitle === 'SECTION Z')!;
      expect(z.pageStart).toBe(30);
      // BIG SECTION has chunks on pages 1 and 50 → pageStart = 1
      const big = result.find(e => e.sectionTitle === 'BIG SECTION')!;
      expect(big.pageStart).toBe(1);
    });

    it('pageEnd equals the maximum pageRef across the section\'s chunks', () => {
      const result = sectionEngine.debugSectionIndex();
      // SECTION Z → pageEnd = 31
      const z   = result.find(e => e.sectionTitle === 'SECTION Z')!;
      expect(z.pageEnd).toBe(31);
      // BIG SECTION → pageEnd = 50
      const big = result.find(e => e.sectionTitle === 'BIG SECTION')!;
      expect(big.pageEnd).toBe(50);
    });

    it('sectionId is a non-empty string for every entry', () => {
      const result = sectionEngine.debugSectionIndex();
      for (const e of result) {
        expect(e.sectionId.length).toBeGreaterThan(0);
      }
    });
  });

  // ── sectionSearch (tests 8–26) ────────────────────────────────────────────

  describe('sectionSearch', () => {
    it('returns results sorted by score descending', async () => {
      const results = await sectionEngine.sectionSearch('essential items', 5);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('respects the topK limit', async () => {
      const top2 = await sectionEngine.sectionSearch('essential items', 2);
      expect(top2).toHaveLength(2);
      const top1 = await sectionEngine.sectionSearch('essential items', 1);
      expect(top1).toHaveLength(1);
    });

    it('each SectionResult has sectionTitle, pageStart, pageEnd, score, topChunks', async () => {
      const results = await sectionEngine.sectionSearch('essential items', 5);
      for (const r of results) {
        expect(typeof r.sectionTitle).toBe('string');
        expect(typeof r.pageStart).toBe('number');
        expect(typeof r.pageEnd).toBe('number');
        expect(typeof r.score).toBe('number');
        expect(Array.isArray(r.topChunks)).toBe(true);
        expect(r.topChunks.length).toBeGreaterThan(0);
      }
    });

    // Fix 1 ──────────────────────────────────────────────────────────────────

    it('Fix 1: section with fewer high-scoring chunks outranks section with many moderate chunks', async () => {
      const results = await sectionEngine.sectionSearch('any query', 10);
      const x = results.find(r => r.sectionTitle === 'SECTION X')!;
      const y = results.find(r => r.sectionTitle === 'SECTION Y')!;
      expect(x).toBeDefined();
      expect(y).toBeDefined();
      // avg-based: Y (0.48) > X (0.3). Sum-based would give X (0.9) > Y (0.48).
      expect(y.score).toBeGreaterThan(x.score);
    });

    it('Fix 1: SECTION X score is the average of its 3 chunk scores, not the sum', async () => {
      const results = await sectionEngine.sectionSearch('any query', 10);
      const x = results.find(r => r.sectionTitle === 'SECTION X')!;
      expect(x.score).toBeCloseTo(0.3, 5); // avg = 0.3; sum would be 0.9
    });

    it('Fix 1: single-chunk section score equals that chunk\'s score', async () => {
      const results = await sectionEngine.sectionSearch('any query', 10);
      const y = results.find(r => r.sectionTitle === 'SECTION Y')!;
      expect(y.score).toBeCloseTo(0.48, 5);
    });

    it('Fix 1: two-chunk section score is the average of those two chunk scores', async () => {
      const results = await sectionEngine.sectionSearch('any query', 10);
      const z = results.find(r => r.sectionTitle === 'SECTION Z')!;
      expect(z.score).toBeCloseTo(0.32, 5); // (0.4 + 0.24) / 2 = 0.32
    });

    // Fix 2 ──────────────────────────────────────────────────────────────────

    it('Fix 2: section spanning more than 40 pages is excluded', async () => {
      const results = await sectionEngine.sectionSearch('essential items', 10);
      expect(results.some(r => r.sectionTitle === 'BIG SECTION')).toBe(false);
    });

    it('Fix 2: sections with page span within 40 pages are included', async () => {
      const results = await sectionEngine.sectionSearch('essential items', 10);
      expect(results.some(r => r.sectionTitle === 'SECTION X')).toBe(true);
      expect(results.some(r => r.sectionTitle === 'SECTION Y')).toBe(true);
      expect(results.some(r => r.sectionTitle === 'SECTION Z')).toBe(true);
    });

    it('Fix 2: BIG SECTION is excluded despite having the highest individual chunk scores', async () => {
      // BIG SECTION chunk score = 0.64, higher than every included section.
      // It must not appear because its page span is 49.
      const results = await sectionEngine.sectionSearch('any query', 10);
      expect(results.find(r => r.sectionTitle === 'BIG SECTION')).toBeUndefined();
    });

    it('Fix 2a: sections whose pageEnd ≤ 10 are excluded as front matter', async () => {
      // FRONT MATTER spans pp.1–5 (pageEnd=5 ≤ 10) and has the highest
      // individual chunk scores (0.72) in the mock set — it must not appear.
      const results = await sectionEngine.sectionSearch('any query', 10);
      expect(results.find(r => r.sectionTitle === 'FRONT MATTER')).toBeUndefined();
    });

    // Fix 2 fallback — needs its own engine where ALL sections are oversized
    describe('fallback when all sections exceed 40 pages', () => {
      let fallbackEngine: RetrievalEngine;

      beforeAll(async () => {
        const ALL_BIG = [
          { id: 'ab1', sectionTitle: 'ALPHA', pageRef:  1, text: 'alpha start', priority: 'normal' as const, embedding: makeEmbedding(0.8) },
          { id: 'ab2', sectionTitle: 'ALPHA', pageRef: 60, text: 'alpha end',   priority: 'normal' as const, embedding: makeEmbedding(0.7) },
          { id: 'bb1', sectionTitle: 'BETA',  pageRef:  2, text: 'beta start',  priority: 'normal' as const, embedding: makeEmbedding(0.6) },
          { id: 'bb2', sectionTitle: 'BETA',  pageRef: 80, text: 'beta end',    priority: 'normal' as const, embedding: makeEmbedding(0.5) },
        ];
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
          json: () => Promise.resolve(structuredClone(ALL_BIG)),
        }));
        const vec = new Float32Array(DIM); vec[0] = 0.8;
        vi.mocked(pipeline).mockResolvedValue(
          vi.fn().mockResolvedValue({ data: vec }) as never,
        );
        fallbackEngine = new RetrievalEngine();
        await fallbackEngine.init();
      });

      it('Fix 2: falls back to chunk-level results when all sections span more than 40 pages', async () => {
        // ALPHA (span=59) and BETA (span=78) are both excluded; fallback activates.
        const results = await fallbackEngine.sectionSearch('any query', 5);
        expect(results.length).toBeGreaterThan(0);
        // Chunk-level fallback: each SectionResult wraps exactly one chunk,
        // so pageStart === pageEnd (both equal the chunk's pageRef).
        for (const r of results) {
          expect(r.pageStart).toBe(r.pageEnd);
          expect(r.topChunks).toHaveLength(1);
        }
      });
    });

    // Fix 3 ──────────────────────────────────────────────────────────────────

    it('Fix 3: section whose title contains a query content word receives a score boost', async () => {
      const results = await sectionEngine.sectionSearch('essential items', 10);
      const ess   = results.find(r => r.sectionTitle === 'ESSENTIAL ITEMS')!;
      const other = results.find(r => r.sectionTitle === 'OTHER DATA')!;
      // Without boost: OTHER DATA raw (0.44) > ESSENTIAL ITEMS raw (0.416)
      // With boost applied to ESSENTIAL ITEMS: 0.416 × 1.25 = 0.52 > 0.44
      expect(ess.score).toBeGreaterThan(other.score);
    });

    it('Fix 3: boosted score equals raw average × 1.25^(number of matching content words)', async () => {
      const results = await sectionEngine.sectionSearch('essential items', 10);
      const ess = results.find(r => r.sectionTitle === 'ESSENTIAL ITEMS')!;
      // "ESSENTIAL ITEMS" matches both "essential" and "items" (2 content words)
      // raw avg = 0.52 × 0.8 = 0.416; boosted = 0.416 × 1.25² = 0.416 × 1.5625 = 0.65
      expect(ess.score).toBeCloseTo(0.65, 5);
    });

    it('Fix 3: stop words in the query do not trigger the title boost', async () => {
      // All tokens ("the", "of", "is") are stop words → content word list is empty
      const results = await sectionEngine.sectionSearch('the of is', 10);
      const ess = results.find(r => r.sectionTitle === 'ESSENTIAL ITEMS')!;
      expect(ess.score).toBeCloseTo(0.416, 5); // raw, unboosted
    });

    it('Fix 3: query tokens of 3 or fewer characters do not trigger the title boost', async () => {
      // "for" (3 chars) and "in" (2 chars) are both below the > 3 threshold
      const results = await sectionEngine.sectionSearch('for in', 10);
      const ess = results.find(r => r.sectionTitle === 'ESSENTIAL ITEMS')!;
      expect(ess.score).toBeCloseTo(0.416, 5); // raw, unboosted
    });

    it('Fix 3: a 4-character non-stop-word token qualifies as a content word', async () => {
      // "data" is exactly 4 chars (> 3) and not a stop word.
      // "OTHER DATA" title contains "data" → score = 0.44 × 1.25 = 0.55.
      const results = await sectionEngine.sectionSearch('data census', 10);
      const other = results.find(r => r.sectionTitle === 'OTHER DATA')!;
      expect(other.score).toBeCloseTo(0.55, 5);
    });

    // General structure ───────────────────────────────────────────────────────

    it('topChunks in each SectionResult have matchType: semantic', async () => {
      const results = await sectionEngine.sectionSearch('essential items', 5);
      for (const s of results) {
        for (const c of s.topChunks) {
          expect(c.matchType).toBe('semantic');
        }
      }
    });

    it('topChunks contains at most 3 entries per section', async () => {
      const results = await sectionEngine.sectionSearch('any query', 10);
      for (const s of results) {
        expect(s.topChunks.length).toBeLessThanOrEqual(3);
      }
    });

    it('pageStart ≤ pageEnd for every section result', async () => {
      const results = await sectionEngine.sectionSearch('any query', 10);
      for (const s of results) {
        expect(s.pageStart).toBeLessThanOrEqual(s.pageEnd);
      }
    });
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { evaluate, CONFIDENCE_THRESHOLD, ENUM_CONFIDENCE_THRESHOLD, LEXICAL_SEMANTIC_FLOOR, QA_THRESHOLD } from '../src/engine/guardrail';
import type { RankedResult } from '../src/engine/types';

// QA threshold constants — hardcoded here to avoid a vitest module-init ordering
// issue that arises because retrieval.test.ts hoists a vi.mock for @xenova/transformers,
// which can leave guardrail.ts's newer exports undefined in the same test run.
// The source of truth is src/engine/config.ts.
const QA_THRESHOLD_VALUE    = QA_THRESHOLD;
const QA_THRESHOLD_EXPECTED = QA_THRESHOLD;

// ── Helper ─────────────────────────────────────────────────────────────────────

function mkResult(
  score: number,
  opts: { id?: string; section?: string; matchType?: 'semantic' | 'lexical'; priority?: 'high' | 'normal'; rawScore?: number } = {},
): RankedResult {
  return {
    chunk: {
      id:           opts.id ?? 'x',
      sectionId:    opts.id ?? 'x',
      sectionTitle: opts.section ?? `Section ${opts.id ?? 'x'}`,
      chapterLabel: 'Chapter 1',
      paragraphs:   ['1.1'],
      pdfPage:      15,
      printedPage:  1,
      printedPageEnd: 1,
      text:         'placeholder text',
      priority:     opts.priority ?? 'normal',
      embedding:    [],
    },
    score,
    // A3: rawScore is what the guardrail thresholds against. Default it to the
    // boosted score so pre-A3 tests keep their meaning unless overridden.
    rawScore: opts.rawScore ?? score,
    matchType: opts.matchType ?? 'semantic',
  };
}

/** An empty lexical fallback — should never be called for semantic-pass tests. */
const noLexical = vi.fn(() => [] as RankedResult[]);

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('guardrail — evaluate()', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    noLexical.mockClear();
  });

  // ── 1. Semantic passes ───────────────────────────────────────────────────────

  it('returns answered:true when top semantic score meets the threshold', () => {
    const sem = [mkResult(0.85, { id: 'a' }), mkResult(0.30, { id: 'b' })];
    const res = evaluate(sem, noLexical);

    expect(res.answered).toBe(true);
    expect(res.results).toBeDefined();
    // Only results that actually clear the threshold are returned
    expect(res.results!.every(r => r.score >= CONFIDENCE_THRESHOLD)).toBe(true);
    expect(res.message).toBeUndefined();
    expect(res.sectionsSearched).toBeUndefined();
  });

  it('does NOT call the lexical fallback when semantic passes', () => {
    evaluate([mkResult(0.9, { id: 'a' })], noLexical);
    expect(noLexical).not.toHaveBeenCalled();
  });

  it('returns all semantic results that meet the threshold, not just the top one', () => {
    const sem = [
      mkResult(0.9, { id: 'a' }),
      mkResult(0.5, { id: 'b' }),  // also above 0.42
      mkResult(0.1, { id: 'c' }),  // below threshold
    ];
    const res = evaluate(sem, noLexical);
    expect(res.results).toHaveLength(2);
    expect(res.results!.map(r => r.chunk.id)).toEqual(['a', 'b']);
  });

  // ── 2. Semantic fails — lexical saves ────────────────────────────────────────

  it('falls back to lexical and returns answered:true when semantic score is below threshold', () => {
    // A3: semantic raws just above the LEXICAL_SEMANTIC_FLOOR are below the 0.42 lookup
    // threshold, so the semantic tier fails — but they clear the floor, so the lexical
    // fallback is allowed to answer.
    const sem = [mkResult(LEXICAL_SEMANTIC_FLOOR + 0.02, { id: 'a' }), mkResult(LEXICAL_SEMANTIC_FLOOR + 0.01, { id: 'b' })];
    const lexResult = mkResult(12.5, { id: 'lex1', section: 'Lexical Hit', matchType: 'lexical' });
    const lexFallback = vi.fn(() => [lexResult]);

    const res = evaluate(sem, lexFallback);

    expect(res.answered).toBe(true);
    expect(res.results).toEqual([lexResult]);
    expect(lexFallback).toHaveBeenCalledOnce(); // called lazily, exactly once
    expect(res.message).toBeUndefined();
    expect(res.sectionsSearched).toBeUndefined();
  });

  it('lexical fallback is called lazily — only after semantic fails', () => {
    // Semantic passes at 0.9, so fallback must not be invoked
    const lexFallback = vi.fn(() => [mkResult(5, { matchType: 'lexical' })]);
    evaluate([mkResult(0.9, { id: 'a' })], lexFallback);
    expect(lexFallback).not.toHaveBeenCalled();

    // Semantic fails at 0.1 raw (but ≥ the lexical floor), so the
    // fallback is invoked. A3: below the floor the fallback is never called.
    const lexFallback2 = vi.fn(() => [mkResult(5, { matchType: 'lexical' })]);
    evaluate([mkResult(LEXICAL_SEMANTIC_FLOOR + 0.01, { id: 'b' })], lexFallback2);
    expect(lexFallback2).toHaveBeenCalledOnce();

    const lexFallback3 = vi.fn(() => [mkResult(5, { matchType: 'lexical' })]);
    evaluate([mkResult(0.1, { id: 'c' })], lexFallback3);
    expect(lexFallback3).not.toHaveBeenCalled(); // below LEXICAL_SEMANTIC_FLOOR
  });

  // ── 3. Both fail ─────────────────────────────────────────────────────────────

  it('returns answered:false with message when both semantic and lexical fail', () => {
    const sem = [mkResult(0.10, { id: 'a' }), mkResult(0.05, { id: 'b' })];
    const res = evaluate(sem, () => []);

    expect(res.answered).toBe(false);
    expect(res.message).toMatch(/WCA 2030/);
    expect(res.results).toBeUndefined();
  });

  it('sectionsSearched contains titles from semantic results when both fail', () => {
    const sem = [
      mkResult(0.10, { id: 'a', section: 'Alpha Section' }),
      mkResult(0.05, { id: 'b', section: 'Beta Section' }),
    ];
    const res = evaluate(sem, () => []);

    expect(res.sectionsSearched).toBeDefined();
    expect(res.sectionsSearched).toContain('Alpha Section');
    expect(res.sectionsSearched).toContain('Beta Section');
  });

  it('sectionsSearched is deduplicated when multiple chunks share the same section title', () => {
    // Multiple chunks may belong to the same ALL-CAPS section heading.
    // Deduplication must collapse them to one entry in sectionsSearched.
    const sem = [
      mkResult(0.10, { id: 'a', section: 'SHARED SECTION' }),
      mkResult(0.08, { id: 'b', section: 'SHARED SECTION' }), // duplicate title
      mkResult(0.05, { id: 'c', section: 'UNIQUE SECTION' }),
    ];
    const res = evaluate(sem, () => []);

    expect(res.answered).toBe(false);
    const sections = res.sectionsSearched!;
    // 'SHARED SECTION' must appear exactly once despite two chunks referencing it
    expect(sections.filter(s => s === 'SHARED SECTION')).toHaveLength(1);
    expect(sections).toContain('UNIQUE SECTION');
    expect(sections).toHaveLength(2);
  });

  it('returns answered:false with empty sectionsSearched when called with no results at all', () => {
    const res = evaluate([], () => []);
    expect(res.answered).toBe(false);
    expect(Array.isArray(res.sectionsSearched)).toBe(true);
    expect(res.sectionsSearched).toHaveLength(0);
  });

  // ── 4. localStorage threshold override ───────────────────────────────────────

  it('reads threshold from localStorage at call time (override to 0.9 blocks a 0.5 score)', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('0.9'),
    });

    const res = evaluate([mkResult(0.5, { id: 'a' })], () => []);
    expect(res.answered).toBe(false); // 0.5 < 0.9
  });

  it('falls back to CONFIDENCE_THRESHOLD when localStorage contains an invalid value', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('not-a-number'),
    });

    // Score well above default 0.42 → should still pass
    const res = evaluate([mkResult(0.8, { id: 'a' })], noLexical);
    expect(res.answered).toBe(true);
  });

  // ── 5. Enum mode threshold (Fix B) ────────────────────────────────────────────

  it('enum mode: ENUM_CONFIDENCE_THRESHOLD is above the lookup default — a 0.43 raw score answers in lookup mode but is refused in enum mode', () => {
    // Before A3 the enum threshold (0.35 on boosted scores) was LOWER than the
    // lookup threshold; gating on the raw cosine made it the stricter gate.
    const resEnum = evaluate([mkResult(0.43, { id: 'a' })], noLexical, 'enum');
    expect(resEnum.answered).toBe(false);

    const resLookup = evaluate([mkResult(0.43, { id: 'b' })], noLexical, 'lookup');
    expect(resLookup.answered).toBe(true);
  });

  it('enum mode answers when the raw score clears ENUM_CONFIDENCE_THRESHOLD', () => {
    const res = evaluate([mkResult(ENUM_CONFIDENCE_THRESHOLD + 0.01, { id: 'a' })], noLexical, 'enum');
    expect(res.answered).toBe(true);
  });

  it('enum mode blocks scores below ENUM_CONFIDENCE_THRESHOLD', () => {
    // One point below the default → not answered even in enum mode.
    const justBelow = ENUM_CONFIDENCE_THRESHOLD - 0.01;
    const res = evaluate([mkResult(justBelow, { id: 'a' })], noLexical, 'enum');
    expect(res.answered).toBe(false);
  });

  it('enum mode reads threshold from wca_enum_threshold localStorage key', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => key === 'wca_enum_threshold' ? '0.5' : null),
    });
    // 0.36 is above the default 0.35 but below the overridden 0.5 → blocked.
    const res = evaluate([mkResult(0.36, { id: 'a' })], noLexical, 'enum');
    expect(res.answered).toBe(false);
  });

  it('lookup mode is unaffected by wca_enum_threshold', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => key === 'wca_enum_threshold' ? '0.1' : null),
    });
    // 0.36 < 0.42 lookup default → still blocked in lookup mode
    // even though enum threshold is overridden to a permissive 0.1.
    const res = evaluate([mkResult(0.36, { id: 'a' })], noLexical);
    expect(res.answered).toBe(false);
  });

  // ── 6. A3 — guardrail gates on the UNBOOSTED rawScore ────────────────────────

  it('A3: a boosted score above threshold never turns a refusal into an answer (lookup mode)', () => {
    // C4 scenario shape: raw cosine 0.40, boosted ×1.15×1.10 ≈ 0.51 > 0.42 —
    // yet the guardrail must refuse because rawScore 0.40 < 0.42.
    const res = evaluate(
      [mkResult(0.51, { id: 'a', rawScore: 0.40 })],
      noLexical,
      'lookup',
    );
    expect(res.answered).toBe(false);
  });

  it('A3: boosts may reorder but a passing rawScore still answers', () => {
    const res = evaluate(
      [
        mkResult(0.55, { id: 'boosted-low-raw', rawScore: 0.30 }),
        mkResult(0.50, { id: 'plain-high-raw', rawScore: 0.45 }),
      ],
      noLexical,
      'lookup',
    );
    expect(res.answered).toBe(true);
    // Only the result whose RAW score clears the threshold is answered.
    expect(res.results!.every(r => r.rawScore >= CONFIDENCE_THRESHOLD)).toBe(true);
    expect(res.results!.map(r => r.chunk.id)).toEqual(['plain-high-raw']);
  });

  it('A3: enum mode also gates on rawScore, not the boosted score', () => {
    // Section-boosted score 0.63 (avg 0.31 × 1.15 × 1.10 × 1.25ⁿ) but plain
    // average raw cosine 0.31 < 0.45 → refused. This is the exact "GDP of
    // Nigeria" failure from audit finding C4.
    const res = evaluate(
      [mkResult(0.63, { id: 'a', rawScore: 0.31 })],
      noLexical,
      'enum',
    );
    expect(res.answered).toBe(false);
  });

  it('A3: lexical fallback is refused when the best semantic raw score is below LEXICAL_SEMANTIC_FLOOR', () => {
    // Semantically implausible query (best raw 0.20): even a strong BM25 hit
    // must not produce an answer.
    const sem = [mkResult(0.20, { id: 'a' })];
    const lexFallback = vi.fn(() => [mkResult(50, { id: 'lex1', matchType: 'lexical' })]);
    const res = evaluate(sem, lexFallback);
    expect(res.answered).toBe(false);
    expect(lexFallback).not.toHaveBeenCalled();
    expect(res.sectionsSearched).toBeDefined();
  });
});

// ── Q&A threshold semantics ────────────────────────────────────────────────────
// These tests verify the relationship between the curated Q&A threshold and the
// document thresholds.  QA_THRESHOLD_VALUE = 0.60 must stay above both
// CONFIDENCE_THRESHOLD (0.42) and ENUM_CONFIDENCE_THRESHOLD (0.35).

describe('QA tier gate', () => {
  it('QA_THRESHOLD is higher than CONFIDENCE_THRESHOLD to avoid false Q&A hits', () => {
    expect(QA_THRESHOLD_VALUE).toBeGreaterThan(CONFIDENCE_THRESHOLD);
  });

  it('QA_THRESHOLD is higher than ENUM_CONFIDENCE_THRESHOLD', () => {
    expect(QA_THRESHOLD_VALUE).toBeGreaterThan(ENUM_CONFIDENCE_THRESHOLD);
  });

  it('QA_THRESHOLD is a value in (0, 1)', () => {
    expect(QA_THRESHOLD_EXPECTED).toBeGreaterThan(0);
    expect(QA_THRESHOLD_EXPECTED).toBeLessThan(1);
  });

  it('a score below QA_THRESHOLD (0.50) is above CONFIDENCE_THRESHOLD — Tier-1 blocks, Tier-2 passes', () => {
    // 0.50 < 0.60 (QA gate) → rejected by Tier 1
    // 0.50 > 0.42 (document gate) → accepted by Tier 2
    const belowQA    = QA_THRESHOLD_VALUE - 0.10;  // 0.50
    const aboveDocTh = belowQA > CONFIDENCE_THRESHOLD;
    expect(aboveDocTh).toBe(true);

    // Confirm Tier-2 evaluate() passes at 0.50
    const res = evaluate([mkResult(belowQA, { id: 'a' })], () => []);
    expect(res.answered).toBe(true);
  });
});

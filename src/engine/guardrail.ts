import type { RankedResult } from './types';

// ── Public types ──────────────────────────────────────────────────────────────

export interface GuardrailResponse {
  answered: boolean;
  results?: RankedResult[];
  message?: string;
  sectionsSearched?: string[];
}

// ── Threshold ─────────────────────────────────────────────────────────────────

/** Hard-coded default for chunk-level (lookup) queries. */
export const CONFIDENCE_THRESHOLD = 0.42;

/**
 * Default threshold for Tier-1 curated Q&A matches.
 * Higher than CONFIDENCE_THRESHOLD because question-to-question cosine
 * similarity is tighter than question-to-chunk, so a higher bar avoids
 * false Q&A hits on loosely related queries.
 * Override live: localStorage.setItem('wca_qa_threshold', '0.55')
 */
export const QA_THRESHOLD = 0.60;

/**
 * Hard-coded default for section-level (enumeration) queries.
 *
 * A3: this now gates on the **rawScore** (plain cosine, no priority/exact-word/
 * title boosts), so the value had to move: with boosts masking raw similarity,
 * 0.35 was reachable by off-topic questions (C4 — "GDP of Nigeria" style).
 * Measured over the 60-question off-topic fixture, the highest raw cosine any
 * off-topic question reaches is 0.442 ("most popular social media platform");
 * 0.45 is therefore the lowest clean threshold at which ALL off-topic
 * questions are refused. Phase C re-tunes this against the gold set.
 *
 * B2.1: splitting the text by heading isolated the genuine paragraph on
 * promoting statistics through social media (¶10.20ff.), which now scores 0.455
 * against "most popular social media platform". 0.46 is the smallest value that
 * refuses it again; on the 51-question probe the same 47 are answered at 0.45,
 * 0.46, and 0.47. C3 re-tunes with held-out sets.
 */
export const ENUM_CONFIDENCE_THRESHOLD = 0.51;

/**
 * A3: a lexical (BM25) fallback answer is only accepted when the query is
 * ALSO semantically plausible — the best semantic raw cosine must reach this
 * floor. Measured: off-topic questions that leak through BM25 all sit below
 * 0.32 raw, while genuine keyword queries land above it. BM25 alone can score
 * highly on incidental shared vocabulary (running headers, common words),
 * so the raw-cosine floor is a second gate on top of MIN_LEXICAL_SCORE and
 * the domain-term gate in RetrievalEngine.lexicalSearch().
 */
export const LEXICAL_SEMANTIC_FLOOR = 0.32;

/**
 * Read the lookup threshold at call time.
 * Override live: localStorage.setItem('wca_threshold', '0.38')
 */
function readThreshold(): number {
  try {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('wca_threshold')
        : null;
    if (stored !== null) {
      const v = parseFloat(stored);
      if (Number.isFinite(v) && v > 0 && v < 1) return v;
    }
  } catch {
    // localStorage is absent in Node.js / test environments without a stub
  }
  return CONFIDENCE_THRESHOLD;
}

/**
 * Read the enumeration threshold at call time.
 * Override live: localStorage.setItem('wca_enum_threshold', '0.30')
 */
function readEnumThreshold(): number {
  try {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('wca_enum_threshold')
        : null;
    if (stored !== null) {
      const v = parseFloat(stored);
      if (Number.isFinite(v) && v > 0 && v < 1) return v;
    }
  } catch {
    // localStorage is absent in Node.js / test environments without a stub
  }
  return ENUM_CONFIDENCE_THRESHOLD;
}

// ── evaluate ──────────────────────────────────────────────────────────────────

/**
 * Three-tier answer cascade:
 *
 * 1. If any semantic result has rawScore ≥ threshold → return those as answered.
 * 2. Otherwise call `lexicalFallback()` lazily     → if it returns ≥ 1 result,
 *    return those as answered (matchType:'lexical').
 * 3. If both fail                                  → answered:false with
 *    sectionsSearched from both attempts, combined and deduplicated.
 *
 * A3: the semantic pass compares the **rawScore** (plain cosine similarity),
 * NOT the boosted ranking score. Boosts (priority ×1.15, exact-word ×1.10,
 * title ×1.25ⁿ) may reorder results but must never turn a refusal into an
 * answer — that was audit finding C4.
 *
 * `lexicalFallback` is invoked lazily — it is never called when semantic passes.
 */
export function evaluate(
  semanticResults: RankedResult[],
  lexicalFallback: () => RankedResult[],
  mode: 'lookup' | 'enum' = 'lookup',
): GuardrailResponse {
  const threshold = mode === 'enum' ? readEnumThreshold() : readThreshold();

  // ── (1) Semantic pass — gate on the UNBOOSTED score (A3) ──────────────────
  const semanticPassing = semanticResults.filter(r => r.rawScore >= threshold);
  if (semanticPassing.length > 0) {
    return { answered: true, results: semanticPassing };
  }

  // ── (2) Lexical fallback ─────────────────────────────────────────────────
  // A3: BM25 matches can fire on incidental vocabulary (running headers,
  // generic words), so a lexical answer additionally requires the query to
  // be semantically plausible: the best semantic raw cosine must reach
  // LEXICAL_SEMANTIC_FLOOR. Below it, the cascade refuses outright.
  const bestRaw = semanticResults.reduce((m, r) => Math.max(m, r.rawScore), 0);
  const lexicalResults = bestRaw >= LEXICAL_SEMANTIC_FLOOR ? lexicalFallback() : [];
  if (lexicalResults.length > 0) {
    return { answered: true, results: lexicalResults };
  }

  // ── (3) Both failed ──────────────────────────────────────────────────────
  // Collect section titles from both attempts, preserving order, deduplicating.
  const seen = new Set<string>();
  const sectionsSearched: string[] = [];
  for (const r of [...semanticResults, ...lexicalResults]) {
    if (!seen.has(r.chunk.sectionTitle)) {
      seen.add(r.chunk.sectionTitle);
      sectionsSearched.push(r.chunk.sectionTitle);
    }
  }

  return {
    answered: false,
    message:
      'This question could not be answered from the WCA 2030 guidelines.',
    sectionsSearched,
  };
}

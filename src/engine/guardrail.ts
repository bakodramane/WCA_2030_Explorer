import { CONFIDENCE_THRESHOLD, ENUM_CONFIDENCE_THRESHOLD, LEXICAL_SEMANTIC_FLOOR } from './config';
import type { RankedResult } from './types';

// ── Public types ──────────────────────────────────────────────────────────────

export interface GuardrailResponse {
  answered: boolean;
  results?: RankedResult[];
  message?: string;
  sectionsSearched?: string[];
}

// ── Thresholds ────────────────────────────────────────────────────────────────
// Defined, with the measurements behind them, in config.ts; re-exported here for existing imports.
export { CONFIDENCE_THRESHOLD, ENUM_CONFIDENCE_THRESHOLD, LEXICAL_SEMANTIC_FLOOR, QA_THRESHOLD } from './config';

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
export interface EvaluateOptions {
  /** Override the semantic raw-score threshold (used by the eval's threshold sweep). */
  threshold?: number;
  /**
   * Override LEXICAL_SEMANTIC_FLOOR. A query made only of domain vocabulary (C0.2) is
   * itself strong evidence of relevance, so the caller may pass 0 for it.
   */
  lexicalFloor?: number;
  /** Extra condition a result must meet to count as an answer (entity grounding, C3). */
  accept?: (result: RankedResult) => boolean;
}

export function evaluate(
  semanticResults: RankedResult[],
  lexicalFallback: () => RankedResult[],
  mode: 'lookup' | 'enum' = 'lookup',
  options: EvaluateOptions = {},
): GuardrailResponse {
  const threshold = options.threshold ?? (mode === 'enum' ? readEnumThreshold() : readThreshold());
  const lexicalFloor = options.lexicalFloor ?? LEXICAL_SEMANTIC_FLOOR;

  // ── (1) Semantic pass — gate on the UNBOOSTED score (A3) ──────────────────
  const accept = options.accept ?? (() => true);
  const semanticPassing = semanticResults.filter(r => r.rawScore >= threshold && accept(r));
  if (semanticPassing.length > 0) {
    return { answered: true, results: semanticPassing };
  }

  // ── (2) Lexical fallback ─────────────────────────────────────────────────
  // A3: BM25 matches can fire on incidental vocabulary (running headers,
  // generic words), so a lexical answer additionally requires the query to
  // be semantically plausible: the best semantic raw cosine must reach
  // LEXICAL_SEMANTIC_FLOOR. Below it, the cascade refuses outright.
  const bestRaw = semanticResults.reduce((m, r) => Math.max(m, r.rawScore), 0);
  const lexicalResults = (bestRaw >= lexicalFloor ? lexicalFallback() : []).filter(accept);
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

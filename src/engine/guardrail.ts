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
 * Lower than the lookup default because section scores are averaged across
 * multiple chunks, so fewer scores reach the high end of the range.
 */
export const ENUM_CONFIDENCE_THRESHOLD = 0.35;

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
 * 1. If any semantic result has score ≥ threshold  → return those as answered.
 * 2. Otherwise call `lexicalFallback()` lazily     → if it returns ≥ 1 result,
 *    return those as answered (matchType:'lexical').
 * 3. If both fail                                  → answered:false with
 *    sectionsSearched from both attempts, combined and deduplicated.
 *
 * `lexicalFallback` is invoked lazily — it is never called when semantic passes.
 */
export function evaluate(
  semanticResults: RankedResult[],
  lexicalFallback: () => RankedResult[],
  mode: 'lookup' | 'enum' = 'lookup',
): GuardrailResponse {
  const threshold = mode === 'enum' ? readEnumThreshold() : readThreshold();

  // ── (1) Semantic pass ────────────────────────────────────────────────────
  const semanticPassing = semanticResults.filter(r => r.score >= threshold);
  if (semanticPassing.length > 0) {
    return { answered: true, results: semanticPassing };
  }

  // ── (2) Lexical fallback ─────────────────────────────────────────────────
  const lexicalResults = lexicalFallback();
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

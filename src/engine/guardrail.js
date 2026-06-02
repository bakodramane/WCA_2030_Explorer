// ── Threshold ─────────────────────────────────────────────────────────────────
/** Hard-coded default — override at runtime via localStorage ('wca_threshold'). */
export const CONFIDENCE_THRESHOLD = 0.42;
/**
 * Read the effective threshold at call time so a developer can tune it live:
 *   localStorage.setItem('wca_threshold', '0.38')
 * Falls back to CONFIDENCE_THRESHOLD when localStorage is unavailable or invalid.
 */
function readThreshold() {
    try {
        const stored = typeof localStorage !== 'undefined'
            ? localStorage.getItem('wca_threshold')
            : null;
        if (stored !== null) {
            const v = parseFloat(stored);
            if (Number.isFinite(v) && v > 0 && v < 1)
                return v;
        }
    }
    catch {
        // localStorage is absent in Node.js / test environments without a stub
    }
    return CONFIDENCE_THRESHOLD;
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
export function evaluate(semanticResults, lexicalFallback) {
    const threshold = readThreshold();
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
    const seen = new Set();
    const sectionsSearched = [];
    for (const r of [...semanticResults, ...lexicalResults]) {
        if (!seen.has(r.chunk.sectionTitle)) {
            seen.add(r.chunk.sectionTitle);
            sectionsSearched.push(r.chunk.sectionTitle);
        }
    }
    return {
        answered: false,
        message: 'This question could not be answered from the WCA 2030 guidelines.',
        sectionsSearched,
    };
}

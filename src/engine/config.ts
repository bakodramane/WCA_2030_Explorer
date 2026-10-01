// Every tunable threshold of the answer cascade, in one place (C3 / E2). The values come from
// `npm run eval` (reports/eval-latest.md): thresholds are chosen on the TUNING off-topic set and
// the gold set only; the held-out sets are reported, never tuned against. Each can be overridden
// at run time with the localStorage key named beside it.

/** Chunk-level (lookup-mode) threshold on the raw cosine. localStorage `wca_threshold`. */
export const CONFIDENCE_THRESHOLD = 0.42;

/**
 * Document tier: minimum raw best-window cosine for a semantic answer. localStorage `wca_enum_threshold`.
 * 0.52 is the lowest value at which none of the 60 tuning off-topic questions is answered (the highest
 * scoring one, "most popular social media platform", reaches 0.505). Gold recall@5 of the document
 * tier alone is 86.4 % at 0.52 against 90.0 % at 0.30.
 *
 * OWNER DECISION (OD.1): stays at 0.52; do not move it to 0.54. The known held-out leaks (cattle herd,
 * tomato fertiliser, aphid pesticide, ocean salinity) are near-domain and are answered with verbatim, cited
 * WCA text, so nothing is fabricated; 0.54 would cost about 3.6 points of recall@5 and would be chosen
 * from held-out results. The 5.6 % held-out rate is an accepted, documented limitation.
 */
export const ENUM_CONFIDENCE_THRESHOLD = 0.52;

/**
 * Curated-Q&A tier: minimum question-to-question cosine. localStorage `wca_qa_threshold`.
 * At 0.60 a related but different curated row answered 27 of the 40 new gold questions with the wrong
 * excerpt (recall@5 70 %); 0.80 gives the best gold recall@5 of the sweep (92.9 %, new questions 90 %).
 */
export const QA_THRESHOLD = 0.80;

/**
 * A lexical (BM25) fallback answer needs the best semantic raw cosine to reach this floor, unless the
 * query is made only of domain vocabulary (C0.2), which needs none. The sweep shows a plateau from 0.34
 * to 0.42 with no tuning leaks and no recall loss; 0.30 lets one leak through. 0.38 is the middle.
 */
export const LEXICAL_SEMANTIC_FLOOR = 0.38;

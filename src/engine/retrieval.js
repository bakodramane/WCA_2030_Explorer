import MiniSearch from 'minisearch';
import { pipeline, env } from '@xenova/transformers';
import { STOP_WORDS } from './stopwords';
import { expandQuery } from './query';
// ── Offline-first configuration ───────────────────────────────────────────────
// Set before any pipeline() call so the browser loads everything from the
// service-worker-cached models/ path and never reaches the network.
// import.meta.env.BASE_URL is injected by Vite at build time (e.g.
// '/WCA_2030_Explorer/' on GitHub Pages, '/' in local dev) so the paths
// resolve correctly regardless of the deployment subdirectory.
env.localModelPath = import.meta.env.BASE_URL + 'models/';
env.allowRemoteModels = false;
// Override the ONNX Runtime WASM file path. The library defaults to the
// jsDelivr CDN; we point it to our pre-cached models/ directory instead.
try {
    const backends = env.backends;
    if (backends?.onnx?.wasm) {
        backends.onnx.wasm.wasmPaths = import.meta.env.BASE_URL + 'models/';
    }
}
catch { /* env.backends not present in test mock — safe to ignore */ }
// ── Constants ─────────────────────────────────────────────────────────────────
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;
const HIGH_PRIORITY_K = 1.15;
/** 1.10× boost applied when a chunk's verbatim text contains at least one
 *  content word from the query.  Stacks multiplicatively with HIGH_PRIORITY_K. */
const EXACT_MATCH_K = 1.10;
// ── RetrievalEngine ───────────────────────────────────────────────────────────
export class RetrievalEngine {
    constructor() {
        this.chunks = [];
        /** Parallel Float32Array per chunk — avoids repeated number[] → Float32 conversions */
        this.vecs = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.extractor = null;
    }
    /**
     * Load chunks.json, initialise the offline embedding model, and build the
     * BM25 lexical index.  Must be called once before any search method.
     */
    async init() {
        // 1. Load the content index (fetch works in both browser and test contexts)
        const res = await fetch(import.meta.env.BASE_URL + 'data/chunks.json');
        const raw = await res.json();
        this.chunks = raw;
        // Convert each embedding array to Float32Array for fast SIMD-friendly loops
        this.vecs = raw.map(c => new Float32Array(c.embedding));
        // 2. Load the embedding model from the offline /models/ cache
        this.extractor = await pipeline('feature-extraction', MODEL_NAME);
        // 3. Build MiniSearch BM25 index over text + sectionTitle.
        //    processTerm strips stop words so off-topic queries that only share
        //    function words (the, is, what…) don't produce false-positive hits.
        this.index = new MiniSearch({
            idField: 'id',
            fields: ['text', 'sectionTitle'],
            processTerm: (term) => STOP_WORDS.has(term.toLowerCase()) ? null : term.toLowerCase(),
        });
        this.index.addAll(raw.map(({ id, text, sectionTitle }) => ({ id, text, sectionTitle })));
    }
    /**
     * Encode the query and rank all chunks by cosine similarity.
     *
     * Because all stored embeddings and the query are L2-normalised, the dot
     * product equals the cosine similarity — no square-root needed.
     *
     * Chunks with `priority: 'high'` receive a 1.15× score boost so that
     * content from key regions (Concepts & Definitions, Essential Items, Glossary)
     * surfaces preferentially for relevant queries.
     */
    async semanticSearch(query, topK = 5) {
        const out = await this.extractor(expandQuery(query), { pooling: 'mean', normalize: true });
        // out.data is a Float32Array of length DIM
        const qVec = new Float32Array(out.data);
        // Pre-compute content words once for the exact-match boost check below.
        const contentWords = this.contentWordsFromQuery(query);
        const scored = this.chunks.map((chunk, i) => {
            const ev = this.vecs[i];
            let dot = 0;
            for (let k = 0; k < DIM; k++)
                dot += qVec[k] * ev[k];
            // 1.15× boost for high-priority regions (Concepts, Essential Items, Glossary).
            let score = chunk.priority === 'high' ? dot * HIGH_PRIORITY_K : dot;
            // 1.10× exact-match boost when the chunk's verbatim text contains at least
            // one content word from the query.  Stacks with the priority boost so
            // e.g. a high-priority chunk that also mentions "holder" gets ×1.15×1.10.
            if (contentWords.length > 0 &&
                contentWords.some(w => chunk.text.toLowerCase().includes(w))) {
                score *= EXACT_MATCH_K;
            }
            return { chunk, score };
        });
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK).map(({ chunk, score }) => ({
            chunk,
            score,
            matchType: 'semantic',
        }));
    }
    lexicalSearch(query, topK = 5) {
        const hits = this.index.search(query, { prefix: true, fuzzy: 0.2 });
        const byId = new Map(this.chunks.map(c => [c.id, c]));
        return hits
            .filter(r => r.score >= RetrievalEngine.MIN_LEXICAL_SCORE)
            .slice(0, topK)
            .filter(r => byId.has(r.id))
            .map(r => ({
            chunk: byId.get(r.id),
            score: r.score,
            matchType: 'lexical',
        }));
    }
    /**
     * Section-level search: scores and ranks whole document sections rather than
     * individual chunks, fixing three failure modes of naive sum-based approaches:
     *
     * Fix 1 — Average scoring: uses the average of the top-3 chunk scores per
     *   section so a large section with many moderate chunks cannot dominate a
     *   small section that has a few highly-relevant chunks.
     *
     * Fix 2 — Size guard: sections spanning more than 40 pages are excluded as
     *   likely chunking artefacts.  When every section exceeds the limit the
     *   method falls back to returning individual chunk results directly.
     *
     * Fix 3 — Title relevance boost: any section whose title contains at least
     *   one content word from the query (token > 3 chars, not a stop word)
     *   receives a 1.25× score multiplier.
     */
    async sectionSearch(query, topK = 5) {
        // Score every chunk so section aggregation has the full picture.
        const allResults = await this.semanticSearch(query, this.chunks.length);
        // Group chunk results by sectionTitle, preserving descending-score order
        // within each group (since allResults is already sorted descending).
        const sectionMap = new Map();
        for (const r of allResults) {
            const key = r.chunk.sectionTitle;
            if (!sectionMap.has(key))
                sectionMap.set(key, { scored: [], pages: [] });
            const s = sectionMap.get(key);
            s.scored.push({ chunk: r.chunk, score: r.score });
            s.pages.push(r.chunk.pageRef);
        }
        const contentWords = this.contentWordsFromQuery(query);
        const scoredSections = [];
        for (const [title, { scored, pages }] of sectionMap) {
            const pageStart = Math.min(...pages);
            const pageEnd = Math.max(...pages);
            // Fix 2a: skip front-matter and table-of-contents pages (≤ 10).
            // These pages list section titles verbatim, giving them artificially high
            // semantic similarity to any query that echoes chapter names.
            if (pageEnd <= 10)
                continue;
            // Fix 2b: skip sections whose page span suggests a chunking artefact.
            if (pageEnd - pageStart > 40)
                continue;
            // scored is already in descending order; take the top 3.
            const top3 = scored.slice(0, 3);
            // Fix 1: average of top-3 (not sum) so section size cannot inflate score.
            const avgScore = top3.reduce((sum, c) => sum + c.score, 0) / top3.length;
            // Fix 3: compound title boost — multiply by 1.25 for each content word
            // from the query that appears in the section title.  A title matching
            // two words gets 1.25² ≈ 1.56×, three words 1.25³ ≈ 1.95×, and so on.
            const titleLower = title.toLowerCase();
            const matchCount = contentWords.filter(w => titleLower.includes(w)).length;
            const score = matchCount > 0 ? avgScore * Math.pow(1.25, matchCount) : avgScore;
            scoredSections.push({
                sectionTitle: title,
                pageStart,
                pageEnd,
                score,
                topChunks: top3.map(c => ({
                    chunk: c.chunk,
                    score: c.score,
                    matchType: 'semantic',
                })),
            });
        }
        // Fix 2 fallback: if every section was excluded by the size guard, fall
        // back to returning individual chunk results so the caller always gets data.
        if (scoredSections.length === 0) {
            return allResults.slice(0, topK).map(r => ({
                sectionTitle: r.chunk.sectionTitle,
                pageStart: r.chunk.pageRef,
                pageEnd: r.chunk.pageRef,
                score: r.score,
                topChunks: [r],
            }));
        }
        scoredSections.sort((a, b) => b.score - a.score);
        return scoredSections.slice(0, topK);
    }
    /**
     * Extract content words from a query for Fix 3 title matching.
     * Content words are tokens longer than 3 characters that are not stop words.
     */
    contentWordsFromQuery(query) {
        return query
            .toLowerCase()
            .split(/\s+/)
            .filter(t => t.length > 3 && !STOP_WORDS.has(t));
    }
    /**
     * Debug helper: returns the top 10 sections by chunk count after init().
     * Call after init() to inspect how chunks are distributed across sections
     * and identify oversized artefact sections before running sectionSearch.
     */
    debugSectionIndex() {
        const sectionMap = new Map();
        for (const c of this.chunks) {
            if (!sectionMap.has(c.sectionTitle)) {
                sectionMap.set(c.sectionTitle, { count: 0, pages: [] });
            }
            const s = sectionMap.get(c.sectionTitle);
            s.count++;
            s.pages.push(c.pageRef);
        }
        return [...sectionMap.entries()]
            .map(([title, { count, pages }], i) => ({
            sectionId: `sec-${i.toString().padStart(4, '0')}`,
            sectionTitle: title,
            chunkCount: count,
            pageStart: Math.min(...pages),
            pageEnd: Math.max(...pages),
        }))
            .sort((a, b) => b.chunkCount - a.chunkCount)
            .slice(0, 10);
    }
}
/**
 * BM25 keyword search via MiniSearch.  Supports prefix matching and light
 * fuzzy matching (up to 20 % edit distance) to handle typos.
 *
 * Results below MIN_LEXICAL_SCORE are discarded: off-topic queries that
 * share only incidental content words with the corpus score < 8, while
 * genuine domain-term matches score well above that.
 */
RetrievalEngine.MIN_LEXICAL_SCORE = 8;

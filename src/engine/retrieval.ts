import MiniSearch from 'minisearch';
import { pipeline, env } from '@xenova/transformers';
import type { Chunk, RankedResult } from './types';

// ── Offline-first configuration ───────────────────────────────────────────────
// Set before any pipeline() call so the browser loads everything from the
// service-worker-cached /models/ path and never reaches the network.
(env as Record<string, unknown>).localModelPath    = '/models/';
(env as Record<string, unknown>).allowRemoteModels = false;

// Override the ONNX Runtime WASM file path. The library defaults to the
// jsDelivr CDN; we point it to our pre-cached /models/ directory instead.
try {
  const backends = (env as any).backends;
  if (backends?.onnx?.wasm) {
    backends.onnx.wasm.wasmPaths = '/models/';
  }
} catch { /* env.backends not present in test mock — safe to ignore */ }

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL_NAME        = 'Xenova/all-MiniLM-L6-v2';
const DIM               = 384;
const HIGH_PRIORITY_K   = 1.15;

// ── Internal document type for MiniSearch ─────────────────────────────────────

interface IndexDoc {
  id: string;
  text: string;
  sectionTitle: string;
}

// Common English stop words excluded from BM25 indexing and search so that
// off-topic queries like "What is the capital of France?" don't match
// agricultural documents purely via function words.
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'by','from','is','are','was','were','be','been','being','have','has',
  'had','do','does','did','will','would','could','should','may','might',
  'it','its','this','that','these','those','i','you','he','she','we',
  'they','what','which','who','whom','whose','how','when','where','why',
  'not','no','nor','so','yet','both','either','each','any','all','some',
  'more','most','other','such','as','if','than','then','there','here',
  'also','just','now','up','out','about','into','through','during',
]);

// ── RetrievalEngine ───────────────────────────────────────────────────────────

export class RetrievalEngine {
  private chunks: Chunk[]           = [];
  /** Parallel Float32Array per chunk — avoids repeated number[] → Float32 conversions */
  private vecs:   Float32Array[]    = [];
  private index!: MiniSearch<IndexDoc>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractor: any            = null;

  /**
   * Load chunks.json, initialise the offline embedding model, and build the
   * BM25 lexical index.  Must be called once before any search method.
   */
  async init(): Promise<void> {
    // 1. Load the content index (fetch works in both browser and test contexts)
    const res = await fetch('./data/chunks.json');
    const raw: Chunk[] = await res.json();

    this.chunks = raw;
    // Convert each embedding array to Float32Array for fast SIMD-friendly loops
    this.vecs = raw.map(c => new Float32Array(c.embedding));

    // 2. Load the embedding model from the offline /models/ cache
    this.extractor = await pipeline('feature-extraction', MODEL_NAME);

    // 3. Build MiniSearch BM25 index over text + sectionTitle.
    //    processTerm strips stop words so off-topic queries that only share
    //    function words (the, is, what…) don't produce false-positive hits.
    this.index = new MiniSearch<IndexDoc>({
      idField: 'id',
      fields: ['text', 'sectionTitle'],
      processTerm: (term) =>
        STOP_WORDS.has(term.toLowerCase()) ? null : term.toLowerCase(),
    });
    this.index.addAll(
      raw.map(({ id, text, sectionTitle }): IndexDoc => ({ id, text, sectionTitle })),
    );
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
  async semanticSearch(query: string, topK = 5): Promise<RankedResult[]> {
    const out  = await this.extractor(query, { pooling: 'mean', normalize: true });
    // out.data is a Float32Array of length DIM
    const qVec = new Float32Array(out.data as ArrayLike<number>);

    const scored = this.chunks.map((chunk, i) => {
      const ev = this.vecs[i];
      let dot = 0;
      for (let k = 0; k < DIM; k++) dot += qVec[k] * ev[k];
      const score = chunk.priority === 'high' ? dot * HIGH_PRIORITY_K : dot;
      return { chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ chunk, score }) => ({
      chunk,
      score,
      matchType: 'semantic' as const,
    }));
  }

  /**
   * BM25 keyword search via MiniSearch.  Supports prefix matching and light
   * fuzzy matching (up to 20 % edit distance) to handle typos.
   *
   * Results below MIN_LEXICAL_SCORE are discarded: off-topic queries that
   * share only incidental content words with the corpus score < 8, while
   * genuine domain-term matches score well above that.
   */
  private static readonly MIN_LEXICAL_SCORE = 8;

  lexicalSearch(query: string, topK = 5): RankedResult[] {
    const hits  = this.index.search(query, { prefix: true, fuzzy: 0.2 });
    const byId  = new Map(this.chunks.map(c => [c.id, c]));

    return hits
      .filter(r => (r.score as number) >= RetrievalEngine.MIN_LEXICAL_SCORE)
      .slice(0, topK)
      .filter(r => byId.has(r.id as string))
      .map(r => ({
        chunk:     byId.get(r.id as string)!,
        score:     r.score,
        matchType: 'lexical' as const,
      }));
  }
}

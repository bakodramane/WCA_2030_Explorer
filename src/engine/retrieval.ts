import MiniSearch from 'minisearch';
import { pipeline, env } from '@xenova/transformers';
import type { Chunk, RankedResult, SectionResult, SectionDebugEntry, QaRow, QaResult, ItemRow, GlossaryEntry, LearningModule, FigureTableEntry } from './types';
import { STOP_WORDS } from './stopwords';
import { expandQuery } from './query';

// Keep in sync with guardrail.QA_THRESHOLD — duplicated here to avoid a
// module-load-order issue that makes the export undefined in the vitest environment
// when retrieval.ts's vi.mock('@xenova/transformers') is hoisted.
const DEFAULT_QA_THRESHOLD = 0.60;

// ── Offline-first configuration ───────────────────────────────────────────────
// Set before any pipeline() call so the browser loads everything from the
// service-worker-cached models/ path and never reaches the network.
// import.meta.env.BASE_URL is injected by Vite at build time (e.g.
// '/WCA_2030_Explorer/' on GitHub Pages, '/' in local dev) so the paths
// resolve correctly regardless of the deployment subdirectory.
(env as Record<string, unknown>).localModelPath    = import.meta.env.BASE_URL + 'models/';
(env as Record<string, unknown>).allowRemoteModels = false;

// Override the ONNX Runtime WASM file path. The library defaults to the
// jsDelivr CDN; we point it to our pre-cached models/ directory instead.
try {
  const backends = (env as any).backends;
  if (backends?.onnx?.wasm) {
    backends.onnx.wasm.wasmPaths = import.meta.env.BASE_URL + 'models/';
  }
} catch { /* env.backends not present in test mock — safe to ignore */ }

// ── Constants ─────────────────────────────────────────────────────────────────

const MODEL_NAME        = 'Xenova/all-MiniLM-L6-v2';
const DIM               = 384;
const HIGH_PRIORITY_K   = 1.15;
/** 1.10× boost applied when a chunk's verbatim text contains at least one
 *  content word from the query.  Stacks multiplicatively with HIGH_PRIORITY_K. */
const EXACT_MATCH_K     = 1.10;

// ── Internal document type for MiniSearch ─────────────────────────────────────

interface IndexDoc {
  id: string;
  text: string;
  sectionTitle: string;
}

// ── RetrievalEngine ───────────────────────────────────────────────────────────

// ── QA threshold helper ───────────────────────────────────────────────────────

function readQaThreshold(): number {
  try {
    const stored =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('wca_qa_threshold')
        : null;
    if (stored !== null) {
      const v = parseFloat(stored);
      if (Number.isFinite(v) && v > 0 && v < 1) return v;
    }
  } catch { /* no localStorage in Node test env */ }
  return DEFAULT_QA_THRESHOLD;
}

// ── RetrievalEngine ───────────────────────────────────────────────────────────

export class RetrievalEngine {
  private chunks: Chunk[]           = [];
  /** Parallel Float32Array per chunk — avoids repeated number[] → Float32 conversions */
  private vecs:   Float32Array[]    = [];
  private index!: MiniSearch<IndexDoc>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractor: any            = null;

  // ── Q&A curated layer ──────────────────────────────────────────────────────
  private qaItems: QaRow[]       = [];
  private qaVecs:  Float32Array[] = [];

  // ── Item catalogue ─────────────────────────────────────────────────────────
  private items: ItemRow[] = [];

  // ── Glossary ───────────────────────────────────────────────────────────────
  private glossary: GlossaryEntry[] = [];

  // ── Figures and tables ─────────────────────────────────────────────────────
  private figuresTables: FigureTableEntry[] = [];

  /**
   * Load chunks.json, initialise the offline embedding model, and build the
   * BM25 lexical index.  Must be called once before any search method.
   */
  async init(): Promise<void> {
    // 1. Load the content index (fetch works in both browser and test contexts)
    const res = await fetch(import.meta.env.BASE_URL + 'data/chunks.json');
    const raw: Chunk[] = await res.json();

    this.chunks = raw;
    // Convert each embedding array to Float32Array for fast SIMD-friendly loops
    this.vecs = raw.map(c => new Float32Array(c.embedding));

    // 1b. Load the curated Q&A index
    try {
      const qaRes = await fetch(import.meta.env.BASE_URL + 'data/qa.json');
      const qaRaw: QaRow[] = await qaRes.json();
      this.qaItems = qaRaw;
      this.qaVecs  = qaRaw.map(r => new Float32Array(r.embedding));
    } catch {
      // qa.json absent (e.g. fresh dev env before build-qa runs) — Tier 1 silently disabled
      this.qaItems = [];
      this.qaVecs  = [];
    }

    // 1c. Load the item catalogue
    try {
      const itemsRes = await fetch(import.meta.env.BASE_URL + 'data/items.json');
      this.items = await itemsRes.json();
    } catch {
      this.items = [];
    }

    // 1d. Load the glossary
    try {
      const glossaryRes = await fetch(import.meta.env.BASE_URL + 'data/glossary.json');
      this.glossary = await glossaryRes.json();
    } catch {
      this.glossary = [];
    }

    // 1e. Load the figures and tables index
    try {
      const ftRes = await fetch(import.meta.env.BASE_URL + 'data/figures-tables.json');
      this.figuresTables = await ftRes.json();
    } catch {
      this.figuresTables = [];
    }

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
    const out  = await this.extractor(expandQuery(query), { pooling: 'mean', normalize: true });
    // out.data is a Float32Array of length DIM
    const qVec = new Float32Array(out.data as ArrayLike<number>);

    // Pre-compute content words once for the exact-match boost check below.
    const contentWords = this.contentWordsFromQuery(query);

    const scored = this.chunks.map((chunk, i) => {
      const ev = this.vecs[i];
      let dot = 0;
      for (let k = 0; k < DIM; k++) dot += qVec[k] * ev[k];
      // 1.15× boost for high-priority regions (Concepts, Essential Items, Glossary).
      let score = chunk.priority === 'high' ? dot * HIGH_PRIORITY_K : dot;
      // 1.10× exact-match boost when the chunk's verbatim text contains at least
      // one content word from the query.  Stacks with the priority boost so
      // e.g. a high-priority chunk that also mentions "holder" gets ×1.15×1.10.
      if (
        contentWords.length > 0 &&
        contentWords.some(w => chunk.text.toLowerCase().includes(w))
      ) {
        score *= EXACT_MATCH_K;
      }
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
  async sectionSearch(query: string, topK = 5): Promise<SectionResult[]> {
    // Score every chunk so section aggregation has the full picture.
    const allResults = await this.semanticSearch(query, this.chunks.length);

    // Group chunk results by sectionTitle, preserving descending-score order
    // within each group (since allResults is already sorted descending).
    const sectionMap = new Map<string, {
      scored: Array<{ chunk: Chunk; score: number }>;
      pages:  number[];
    }>();

    for (const r of allResults) {
      const key = r.chunk.sectionTitle;
      if (!sectionMap.has(key)) sectionMap.set(key, { scored: [], pages: [] });
      const s = sectionMap.get(key)!;
      s.scored.push({ chunk: r.chunk, score: r.score });
      s.pages.push(r.chunk.pageRef);
    }

    const contentWords = this.contentWordsFromQuery(query);

    const scoredSections: SectionResult[] = [];

    for (const [title, { scored, pages }] of sectionMap) {
      const pageStart = Math.min(...pages);
      const pageEnd   = Math.max(...pages);

      // Fix 2a: skip front-matter and table-of-contents pages (≤ 10).
      // These pages list section titles verbatim, giving them artificially high
      // semantic similarity to any query that echoes chapter names.
      if (pageEnd <= 10) continue;

      // Fix 2b: skip sections whose page span suggests a chunking artefact.
      if (pageEnd - pageStart > 40) continue;

      // scored is already in descending order; take the top 3.
      const top3     = scored.slice(0, 3);
      // Fix 1: average of top-3 (not sum) so section size cannot inflate score.
      const avgScore = top3.reduce((sum, c) => sum + c.score, 0) / top3.length;

      // Fix 3: compound title boost — multiply by 1.25 for each content word
      // from the query that appears in the section title.  A title matching
      // two words gets 1.25² ≈ 1.56×, three words 1.25³ ≈ 1.95×, and so on.
      const titleLower  = title.toLowerCase();
      const matchCount  = contentWords.filter(w => titleLower.includes(w)).length;
      const score = matchCount > 0 ? avgScore * Math.pow(1.25, matchCount) : avgScore;

      scoredSections.push({
        sectionTitle: title,
        pageStart,
        pageEnd,
        score,
        topChunks: top3.map(c => ({
          chunk:     c.chunk,
          score:     c.score,
          matchType: 'semantic' as const,
        })),
      });
    }

    // Fix 2 fallback: if every section was excluded by the size guard, fall
    // back to returning individual chunk results so the caller always gets data.
    if (scoredSections.length === 0) {
      return allResults.slice(0, topK).map(r => ({
        sectionTitle: r.chunk.sectionTitle,
        pageStart:    r.chunk.pageRef,
        pageEnd:      r.chunk.pageRef,
        score:        r.score,
        topChunks:    [r],
      }));
    }

    scoredSections.sort((a, b) => b.score - a.score);
    return scoredSections.slice(0, topK);
  }

  /**
   * Extract content words from a query for Fix 3 title matching.
   * Content words are tokens longer than 3 characters that are not stop words.
   */
  private contentWordsFromQuery(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 3 && !STOP_WORDS.has(t));
  }

  /**
   * Tier-1 curated Q&A search.
   *
   * Embeds the query and computes cosine similarity (dot product of normalised
   * vectors) against every pre-embedded question in qa.json.  Returns the
   * best-matching row only if its score meets or exceeds QA_THRESHOLD (default
   * 0.60, tunable via localStorage 'wca_qa_threshold').
   *
   * Returns null when:
   *   • qa.json was not loaded (graceful degradation)
   *   • no match meets the threshold
   */
  async qaSearch(query: string): Promise<QaResult | null> {
    if (this.qaItems.length === 0) return null;

    // Use the raw query — no synonym expansion — because the stored Q&A embeddings
    // were produced from the original question text.  Expansion shifts the vector
    // away from the stored question, hurting recall for the curated tier.
    const out  = await this.extractor(query, { pooling: 'mean', normalize: true });
    const qVec = new Float32Array(out.data as ArrayLike<number>);

    let bestScore = -Infinity;
    let bestIndex = -1;

    for (let i = 0; i < this.qaVecs.length; i++) {
      const ev = this.qaVecs[i];
      let dot  = 0;
      for (let k = 0; k < DIM; k++) dot += qVec[k] * ev[k];
      if (dot > bestScore) { bestScore = dot; bestIndex = i; }
    }

    const threshold = readQaThreshold();
    if (bestIndex < 0 || bestScore < threshold) return null;
    return { row: this.qaItems[bestIndex], score: bestScore };
  }

  /** Returns all question strings from the curated Q&A bank, in load order. */
  getQaQuestions(): string[] {
    return this.qaItems.map(r => r.question);
  }

  /** Returns all Q&A rows, in load order. Used by the self-test mode. */
  getAllQa(): QaRow[] {
    return this.qaItems.slice();
  }

  /** Return all items, optionally filtered by category, in load order. */
  getItems(category?: 'essential' | 'additional'): ItemRow[] {
    return category ? this.items.filter(i => i.category === category) : this.items;
  }

  /** Return the item with the given 4-digit zero-padded code, or null. */
  lookupItem(code: string): ItemRow | null {
    return this.items.find(i => i.code === code) ?? null;
  }

  /**
   * Returns the distinct theme strings from items.json in natural numeric order
   * (Theme 1 → Theme 12), not lexicographic order which would misplace Theme 10–12.
   */
  getThemes(): string[] {
    const seen = new Set<string>();
    for (const item of this.items) if (item.theme) seen.add(item.theme);
    return [...seen].sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
      return na - nb;
    });
  }

  /** Returns all items belonging to the given theme string (exact match). */
  getItemsByTheme(theme: string): ItemRow[] {
    return this.items.filter(i => i.theme === theme);
  }

  /**
   * Groups all qa.json rows into five ordered learning modules using keyword
   * matching on the pipe-separated tags + section_title fields.
   * Rows matching none of the first four modules fall into Cross-cutting topics.
   * Empty modules are omitted from the result.
   */
  getLearningModules(): LearningModule[] {
    if (this.qaItems.length === 0) return [];

    const DEFS: Array<{ id: string; title: string; description: string; keywords: string[] }> = [
      {
        id:          'foundations',
        title:       'Foundations',
        description: 'What a census is, agricultural holdings and holders, scope, coverage, and key definitions.',
        keywords:    ['census', 'definition', 'overview', 'objectives', 'holding', 'holder',
                      'scope', 'coverage', 'history', 'frequency', 'statistical-unit',
                      'household', 'parcel', 'field', 'plot', 'types', 'exclusions'],
      },
      {
        id:          'methodology',
        title:       'Methodology',
        description: 'Census modalities, frames, enumeration strategies, quality assurance, and planning.',
        keywords:    ['modalities', 'classical', 'modular', 'frame', 'sampling', 'enumeration',
                      'quality', 'planning', 'content', 'cut-off', 'threshold', 'screening',
                      'technology', 'strategies', 'flexible-enumeration', 'short-long-questionnaire',
                      'farm-register', 'administrative-records', 'rare-events', 'complete-enumeration',
                      'core-module', 'joint-operation', 'coordination', 'phases', 'timing',
                      'inter-censal', 'reference-period', 'integration', 'economic-census',
                      'population-census', 'registers'],
      },
      {
        id:          'items-themes',
        title:       'Items and themes',
        description: 'Essential and additional items, the twelve data themes, and classification of census variables.',
        keywords:    ['essential-items', 'additional-items', 'decision-tree', 'classification-variables',
                      'screening-items', 'theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5',
                      'theme-6', 'theme-7', 'theme-8', 'theme-9', 'theme-10', 'theme-11', 'theme-12'],
      },
      {
        id:          'tabulation',
        title:       'Tabulation and dissemination',
        description: 'Tabulation plans, output products, microdata access, data quality, and archiving.',
        keywords:    ['tabulation', 'dissemination', 'disclosure', 'confidentiality', 'microdata',
                      'archiving', 'data-conflicts', 'reconciliation', 'benchmarking', 'uses',
                      'community-level', 'community', 'holding-level', 'reporting-system', 'policy',
                      'access', 'preservation', 'products'],
      },
    ];

    const classify = (row: QaRow): string => {
      const text = (row.tags + ' ' + row.section_title).toLowerCase().replace(/[|,]/g, ' ');
      for (const def of DEFS) {
        if (def.keywords.some(kw => text.includes(kw))) return def.id;
      }
      return 'crosscutting';
    };

    const buckets = new Map<string, QaRow[]>();
    for (const def of DEFS) buckets.set(def.id, []);
    buckets.set('crosscutting', []);

    for (const row of this.qaItems) {
      buckets.get(classify(row))!.push(row);
    }

    const modules: LearningModule[] = DEFS.map(d => ({
      id:          d.id,
      title:       d.title,
      description: d.description,
      questions:   buckets.get(d.id)!,
    }));

    modules.push({
      id:          'crosscutting',
      title:       'Cross-cutting topics',
      description: 'SDG indicators, gender statistics, geospatial methods, international frameworks, and annexes.',
      questions:   buckets.get('crosscutting')!,
    });

    return modules.filter(m => m.questions.length > 0);
  }

  /** Returns all glossary entries sorted alphabetically by term. */
  getGlossary(): GlossaryEntry[] {
    return this.glossary.slice().sort((a, b) =>
      a.term.toLowerCase().localeCompare(b.term.toLowerCase()),
    );
  }

  /** Case-insensitive exact match against all glossary terms; returns null if not found. */
  lookupTerm(term: string): GlossaryEntry | null {
    const needle = term.trim().toLowerCase();
    return this.glossary.find(e => e.term.toLowerCase() === needle) ?? null;
  }

  /** Returns all figure/table entries in file order. */
  getFiguresTables(): FigureTableEntry[] {
    return this.figuresTables;
  }

  /** Looks up by kind ('figure'|'table', case-insensitive) and ref string (exact). */
  lookupFigureTable(kind: string, ref: string): FigureTableEntry | null {
    const k = kind.toLowerCase() as 'figure' | 'table';
    return this.figuresTables.find(e => e.kind === k && e.ref === ref.trim()) ?? null;
  }

  /**
   * Debug helper: returns the top 10 sections by chunk count after init().
   * Call after init() to inspect how chunks are distributed across sections
   * and identify oversized artefact sections before running sectionSearch.
   */
  debugSectionIndex(): SectionDebugEntry[] {
    const sectionMap = new Map<string, { count: number; pages: number[] }>();
    for (const c of this.chunks) {
      if (!sectionMap.has(c.sectionTitle)) {
        sectionMap.set(c.sectionTitle, { count: 0, pages: [] });
      }
      const s = sectionMap.get(c.sectionTitle)!;
      s.count++;
      s.pages.push(c.pageRef);
    }

    return [...sectionMap.entries()]
      .map(([title, { count, pages }], i) => ({
        sectionId:    `sec-${i.toString().padStart(4, '0')}`,
        sectionTitle: title,
        chunkCount:   count,
        pageStart:    Math.min(...pages),
        pageEnd:      Math.max(...pages),
      }))
      .sort((a, b) => b.chunkCount - a.chunkCount)
      .slice(0, 10);
  }
}

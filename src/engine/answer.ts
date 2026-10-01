// The search cascade, shared by the UI (App.ts) and the evaluation script (scripts/eval.ts)
// so both exercise exactly the same code path (C2).
//
//   Tier 0   exact lookups: item code, glossary term, figure/table reference
//   Tier 1   curated Q&A match
//   Tier 2   document search ranked by section or by chunk, then the guardrail
//            (semantic gate on the raw score, lexical fallback)
import { mentionsAll, queryEntities } from './entities';
import { evaluate, type EvaluateOptions, type GuardrailResponse } from './guardrail';
import type { RetrievalEngine } from './retrieval';
import type { FigureTableEntry, GlossaryEntry, ItemRow, QaResult, RankedResult } from './types';

/** How the document tier orders its candidates (C0.1). */
export type Ranking = 'section' | 'chunk' | 'chunk-raw';

/** C0.1: ranking chunks by raw best-window cosine (at most two per section) beat section grouping and boosted chunk ranking; see reports/eval-latest.md. */
export const DEFAULT_RANKING: Ranking = 'chunk-raw';
const RESULT_LIMIT = 10;
/** Chunk rankings show at most this many chunks per section, for diversity. */
const PER_SECTION_CAP = 2;

export type AnswerOutcome =
  | { tier: 'item'; item: ItemRow }
  | { tier: 'glossary'; entry: GlossaryEntry }
  | { tier: 'figure-table'; entry: FigureTableEntry }
  | { tier: 'verified'; qa: QaResult }
  | { tier: 'document'; results: RankedResult[]; guardrail: GuardrailResponse }
  | { tier: 'not-found'; guardrail: GuardrailResponse };

export interface AnswerOptions {
  ranking?: Ranking;
  /** Skip tiers 0 and 1 and exercise only the document tier (evaluation of raw retrieval). */
  documentOnly?: boolean;
  guardrail?: EvaluateOptions;
  /** Replaces the curated-Q&A lookup (the eval injects cached, thresholded matches). */
  qaLookup?: (query: string) => Promise<QaResult | null>;
}

/** Normalised 4-digit item code from "item 115", "item 0115", "0115", "115" → "0115"; else null. */
export function extractItemCode(query: string): string | null {
  const clean = query.trim().replace(/^item\s+/i, '').trim();
  const m = clean.match(/\b(\d{3,4})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!n || n > 9999) return null;
  return String(n).padStart(4, '0');
}

/** Figure/table kind and ref from "Table 9.1" or "Figure A10.1 decision tree"; else null. */
export function extractFigureTableRef(query: string): { kind: string; ref: string } | null {
  const m = query.trim().match(/^(figure|table)\s+([A-Za-z]?\d+\.\d+)/i);
  return m ? { kind: m[1].toLowerCase(), ref: m[2] } : null;
}

export interface DocumentSearch {
  /** Named entities in the query (C3); every answer must mention all of them. */
  entities: string[];
  candidates: RankedResult[];
  lexicalFallback: () => RankedResult[];
  /** Pass to evaluate() as lexicalFloor: 0 for a pure domain-vocabulary query (C0.2), else the default. */
  lexicalFloor: number | undefined;
}

/** Gather the candidates the guardrail will judge; separated from judging so thresholds can be swept. */
export async function searchDocument(
  engine: RetrievalEngine,
  query: string,
  ranking: Ranking = DEFAULT_RANKING,
): Promise<DocumentSearch> {
  let candidates: RankedResult[];
  if (ranking === 'section') {
    const sections = await engine.sectionSearch(query, RESULT_LIMIT);
    candidates = sections.filter(s => s.topChunks.length > 0).map(s => ({
      chunk: s.topChunks[0].chunk,
      score: s.score,
      rawScore: s.rawScore, // A3: the guardrail gates on this unboosted score
      matchType: 'semantic' as const,
    }));
  } else {
    const all = await engine.semanticSearch(query, Number.MAX_SAFE_INTEGER);
    const ordered = ranking === 'chunk-raw' ? [...all].sort((a, b) => b.rawScore - a.rawScore) : all;
    const perSection = new Map<string, number>();
    candidates = [];
    for (const r of ordered) {
      const used = perSection.get(r.chunk.sectionId) ?? 0;
      if (used >= PER_SECTION_CAP) continue;
      perSection.set(r.chunk.sectionId, used + 1);
      candidates.push(r);
      if (candidates.length === RESULT_LIMIT) break;
    }
  }
  return {
    entities: queryEntities(query),
    candidates,
    lexicalFallback: () => engine.lexicalSearch(query, RESULT_LIMIT),
    lexicalFloor: engine.isVocabularyQuery(query) ? 0 : undefined,
  };
}

export function judgeDocument(search: DocumentSearch, options: EvaluateOptions = {}): GuardrailResponse {
  const { entities } = search;
  return evaluate(search.candidates, search.lexicalFallback, 'enum', {
    lexicalFloor: search.lexicalFloor,
    accept: r => mentionsAll(r.chunk.text, entities),
    ...options,
  });
}

/** Run the full cascade for one query. */
export async function answerQuery(
  engine: RetrievalEngine,
  query: string,
  options: AnswerOptions = {},
): Promise<AnswerOutcome> {
  if (!options.documentOnly) {
    const code = extractItemCode(query);
    const item = code ? engine.lookupItem(code) : null;
    if (item) return { tier: 'item', item };

    const entry = engine.lookupTerm(query.trim());
    if (entry) return { tier: 'glossary', entry };

    const ref = extractFigureTableRef(query);
    const figure = ref ? engine.lookupFigureTable(ref.kind, ref.ref) : null;
    if (figure) return { tier: 'figure-table', entry: figure };

    const qa = await (options.qaLookup ?? ((q: string) => engine.qaSearch(q)))(query);
    // A curated row that never mentions a name in the question (Kenya, India) is a topic match, not an answer.
    if (qa && mentionsAll(`${qa.row.question} ${qa.row.answer} ${qa.row.excerpt}`, queryEntities(query))) return { tier: 'verified', qa };
  }

  const guardrail = judgeDocument(await searchDocument(engine, query, options.ranking), options.guardrail);
  return guardrail.answered && guardrail.results
    ? { tier: 'document', results: guardrail.results, guardrail }
    : { tier: 'not-found', guardrail };
}

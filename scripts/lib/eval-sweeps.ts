// Threshold sweeps for scripts/eval.ts: semantic threshold, lexical floor, curated-Q&A threshold.
import { answerQuery, judgeDocument, searchDocument, type AnswerOutcome, type DocumentSearch, type Ranking } from '../../src/engine/answer';
import type { RetrievalEngine } from '../../src/engine/retrieval';
import type { QaResult } from '../../src/engine/types';
import { scoreOutcome, type GoldItem, type ItemResult } from './eval-engine';
import { pct, summarise, table } from './eval-report';

export interface SweepContext {
  engine: RetrievalEngine;
  ranking: Ranking;
  gold: GoldItem[];
  tuning: string[];
  heldout: string[];
  nearDomain: string[];
  say: (text?: string) => void;
}

const range = (from: number, step: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => Number((from + i * step).toFixed(2)));

/** Document-tier sweeps: the semantic threshold, then the lexical floor. */
export async function documentSweeps(ctx: SweepContext): Promise<void> {
  const { engine, ranking, gold, tuning, heldout, nearDomain, say } = ctx;
  const cache = new Map<string, DocumentSearch>();
  const search = async (q: string): Promise<DocumentSearch> => {
    if (!cache.has(q)) cache.set(q, await searchDocument(engine, q, ranking));
    return cache.get(q)!;
  };
  const sweep = async (label: string, values: number[], options: (v: number, s: DocumentSearch) => { threshold?: number; lexicalFloor?: number }, name: (v: number) => string): Promise<Array<{ value: number; cells: Array<string | number>; tuningLeaks: number }>> => {
    const rows = [];
    for (const value of values) {
      const results: ItemResult[] = [];
      for (const item of gold) {
        const s = await search(item.question);
        const g = judgeDocument(s, options(value, s));
        results.push(scoreOutcome(item, g.answered && g.results ? { tier: 'document', results: g.results, guardrail: g } : { tier: 'not-found', guardrail: g }));
      }
      const leaks = async (qs: string[]): Promise<number> => {
        let n = 0;
        for (const q of qs) { const s = await search(q); if (judgeDocument(s, options(value, s)).answered) n++; }
        return n;
      };
      const [t, h, nd] = [await leaks(tuning), await leaks(heldout), await leaks(nearDomain)];
      const sum = summarise(results);
      rows.push({ value, tuningLeaks: t, cells: [name(value), pct(sum.answered, sum.n), pct(sum.recall5, sum.n), `${t}/${tuning.length}`, `${h}/${heldout.length}`, `${nd}/${nearDomain.length}`] });
    }
    say(`## ${label}`); say();
    say(table(['value', 'gold answered', 'gold recall@5', 'tuning false', 'held-out false', 'near-domain false'], rows.map(r => r.cells)));
    return rows;
  };

  const sem = await sweep('Semantic threshold sweep (document tier, raw best-window cosine)', range(0.30, 0.02, 16), v => ({ threshold: v }), v => v.toFixed(2));
  const first = sem.find(r => r.tuningLeaks === 0);
  say();
  say(first ? `Lowest threshold with 0 tuning false answers: **${first.value.toFixed(2)}** → ${first.cells.slice(1).join(' / ')} (answered / recall@5 / tuning / held-out / near-domain).` : 'No threshold in 0.30–0.60 gives 0 tuning false answers.');
  say();
  await sweep('Lexical-fallback floor sweep (semantic threshold at its current value)', [0.30, 0.34, 0.38, 0.42, 0.46, 1], (v, s) => ({ lexicalFloor: s.lexicalFloor === 0 ? 0 : v }), v => v === 1 ? 'lexical off' : v.toFixed(2));
  say('\nA pure domain-vocabulary query (C0.2) keeps floor 0 in every row.');
}

/** Curated-Q&A threshold sweep through the FULL cascade, with the Q&A lookup cached per query. */
export async function qaSweep(ctx: SweepContext): Promise<void> {
  const { engine, ranking, gold, tuning, heldout, nearDomain, say } = ctx;
  const best = new Map<string, QaResult | null>();
  for (const q of [...gold.map(g => g.question), ...tuning, ...heldout]) best.set(q, await engine.qaBest(q));

  const rows: Array<Array<string | number>> = [];
  for (const threshold of range(0.50, 0.05, 10)) {
    const qaLookup = async (q: string): Promise<QaResult | null> => {
      const b = best.get(q) ?? null;
      return b && b.score >= threshold ? b : null;
    };
    const results: ItemResult[] = [];
    for (const item of gold) results.push(scoreOutcome(item, await answerQuery(engine, item.question, { ranking, qaLookup })));
    const kind = (k: GoldItem['kind']): string => { const s = summarise(results.filter(r => r.item.kind === k)); return pct(s.recall5, s.n); };
    const leaks = async (qs: string[]): Promise<number> => {
      let n = 0;
      for (const q of qs) if ((await answerQuery(engine, q, { ranking, qaLookup }) as AnswerOutcome).tier !== 'not-found') n++;
      return n;
    };
    const all = summarise(results);
    rows.push([threshold.toFixed(2), pct(all.recall5, all.n), kind('reworded'), kind('new'), kind('short'), all.tiers.verified ?? 0, `${await leaks(tuning)}/${tuning.length}`, `${await leaks(heldout)}/${heldout.length}`, `${await leaks(nearDomain)}/${nearDomain.length}`]);
  }
  say('## Curated-Q&A threshold sweep (full cascade)'); say();
  say(table(['Q&A threshold', 'gold recall@5', 'reworded', 'new', 'short', 'answered by Q&A', 'tuning false', 'held-out false', 'near-domain false'], rows));
}

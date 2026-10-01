// C2: `npm run eval` — runs the real search cascade (src/engine/answer.ts, the same code the UI
// uses) over the gold set and the off-topic sets, and writes reports/eval-latest.md.
//   npx tsx scripts/eval.ts [--data <dir>] [--ranking section|chunk|chunk-raw] [--out <file>] [--label <text>] [--quick]
import fs from 'node:fs';
import path from 'node:path';
import { answerQuery, DEFAULT_RANKING, type AnswerOptions, type Ranking } from '../src/engine/answer';
import { ENUM_CONFIDENCE_THRESHOLD, LEXICAL_SEMANTIC_FLOOR, QA_THRESHOLD } from '../src/engine/guardrail';
import { loadEngine, readFixture, scoreOutcome, type GoldItem, type ItemResult } from './lib/eval-engine';
import { pct, summarise, summaryRow, SUMMARY_HEADERS, table } from './lib/eval-report';
import { documentSweeps, qaSweep } from './lib/eval-sweeps';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const RANKINGS: Ranking[] = ['section', 'chunk', 'chunk-raw'];

async function main(): Promise<void> {
  const dataDir = path.resolve(arg('data', path.join('public', 'data')));
  const ranking = arg('ranking', DEFAULT_RANKING) as Ranking;
  const outFile = arg('out', path.join('reports', 'eval-latest.md'));
  const engine = await loadEngine(dataDir);

  const gold = readFixture<{ items: GoldItem[] }>('gold.json').items;
  const tuning = readFixture<{ questions: string[] }>('off-topic.json').questions;
  const held = readFixture<{ questions: string[]; nearDomain: string[] }>('off-topic-heldout.json');
  const held2 = readFixture<{ questions: string[]; nearDomain: string[] }>('off-topic-heldout2.json');
  const chunks = JSON.parse(fs.readFileSync(path.join(dataDir, 'chunks.json'), 'utf-8')) as Array<{ windows?: unknown[] }>;
  const out: string[] = [];
  const say = (text = ''): void => { out.push(text); console.log(text); };

  const runGold = async (options: AnswerOptions): Promise<ItemResult[]> => {
    const results: ItemResult[] = [];
    for (const item of gold) results.push(scoreOutcome(item, await answerQuery(engine, item.question, options)));
    return results;
  };
  const byKind = (results: ItemResult[]): Array<Array<string | number>> => [
    summaryRow('all gold', summarise(results)),
    ...(['reworded', 'new', 'short'] as const).map(k => summaryRow(k, summarise(results.filter(r => r.item.kind === k)))),
  ];
  const leaks = async (questions: string[]): Promise<string[]> => {
    const bad: string[] = [];
    for (const q of questions) if ((await answerQuery(engine, q, { ranking })).tier !== 'not-found') bad.push(q);
    return bad;
  };

  say(`# Evaluation — ${arg('label', 'current data')}`);
  say();
  say(`Data: \`${path.relative(process.cwd(), dataDir).startsWith('..') ? path.basename(dataDir) : path.relative(process.cwd(), dataDir)}\` — ${chunks.length} chunks, ${chunks.reduce((n, c) => n + (c.windows?.length ?? 1), 0)} embedded vectors. Ranking: \`${ranking}\`. Thresholds: semantic ${ENUM_CONFIDENCE_THRESHOLD}, Q&A ${QA_THRESHOLD}, lexical floor ${LEXICAL_SEMANTIC_FLOOR}. Recall = the expected paragraph, or a chunk within one printed page of the expected page (short queries: the answer chunk contains the term; an item card or curated row counts when its verbatim text holds the answer).`);

  const full = await runGold({ ranking });
  say(); say('## Full cascade (as the UI runs it)'); say();
  say(table(SUMMARY_HEADERS, byKind(full))); say();
  say(`Tier that answered: ${Object.entries(summarise(full).tiers).map(([t, n]) => `${t} ${n}`).join(', ')}.`);

  say(); say('## Document tier only (lookups and Q&A bypassed): ranking comparison (C0.1)'); say();
  const comparison = [];
  for (const r of RANKINGS) comparison.push(summaryRow(`\`${r}\``, summarise(await runGold({ ranking: r, documentOnly: true }))));
  say(table(['ranking', 'n', 'answered', 'recall@1', 'recall@5', 'top citation correct (of answered)'], comparison));

  say(); say('## False answers (full cascade; lower is better)'); say();
  const [badTuning, badHeld, badNear] = [await leaks(tuning), await leaks(held.questions), await leaks(held.nearDomain)];
  const [badHeld2, badNear2] = [await leaks(held2.questions), await leaks(held2.nearDomain)];
  say(table(['set', 'questions', 'answered (false)', 'rate'], [
    ['tuning (off-topic.json)', tuning.length, badTuning.length, pct(badTuning.length, tuning.length)],
    ['held-out (off-topic-heldout.json)', held.questions.length, badHeld.length, pct(badHeld.length, held.questions.length)],
    ['near-domain traps (subset of held-out)', held.nearDomain.length, badNear.length, pct(badNear.length, held.nearDomain.length)],
    ['held-out 2 (off-topic-heldout2.json; written before the entity gate was measured)', held2.questions.length, badHeld2.length, pct(badHeld2.length, held2.questions.length)],
    ['near-domain traps (subset of held-out 2)', held2.nearDomain.length, badNear2.length, pct(badNear2.length, held2.nearDomain.length)],
  ]));
  for (const [label, bad] of [['tuning', badTuning], ['held-out', badHeld], ['held-out 2', badHeld2]] as const) if (bad.length) say(`\nLeaked (${label}): ${bad.map(q => `“${q}”`).join('; ')}`);

  if (!process.argv.includes('--quick')) {
    const ctx = { engine, ranking, gold, tuning, heldout: held.questions, nearDomain: held.nearDomain, say };
    say(); await documentSweeps(ctx);
    say(); await qaSweep(ctx);
  }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${out.join('\n')}\n`, 'utf-8');
  console.log(`\nWrote ${outFile}`);
}

main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });

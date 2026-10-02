// Dev probe: full-cascade gold recall@5 and held-out leaks at stricter semantic thresholds (C3 trade-off).
import path from 'node:path';
import { answerQuery } from '../../src/engine/answer';
import { loadEngine, readFixture, scoreOutcome, type GoldItem } from '../lib/eval-engine';
const engine = await loadEngine(path.join(process.cwd(), 'public', 'data'));
const gold = readFixture<{ items: GoldItem[] }>('gold.json').items;
const sets = ['off-topic-heldout.json', 'off-topic-heldout2.json'].map(f => readFixture<{ questions: string[] }>(f).questions);
for (const threshold of [0.52, 0.54, 0.56, 0.58, 0.60, 0.62]) {
  let hits = 0;
  for (const g of gold) if (scoreOutcome(g, await answerQuery(engine, g.question, { guardrail: { threshold } })).top5) hits++;
  const leaks = [];
  for (const qs of sets) { let n = 0; for (const q of qs) if ((await answerQuery(engine, q, { guardrail: { threshold } })).tier !== 'not-found') n++; leaks.push(`${n}/${qs.length}`); }
  console.log(`T=${threshold}  full-cascade recall@5 ${(100 * hits / gold.length).toFixed(1)} %  held-out leaks ${leaks.join('  ')}`);
}

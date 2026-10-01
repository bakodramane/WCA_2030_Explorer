// Dev probe: what answers each held-out-2 question at the current thresholds? (investigation only)
import path from 'node:path';
import { answerQuery } from '../../src/engine/answer';
import { loadEngine, readFixture } from '../lib/eval-engine';
const engine = await loadEngine(path.join(process.cwd(), 'public', 'data'));
const held = readFixture<{ questions: string[] }>('off-topic-heldout2.json').questions;
for (const q of held) {
  const o = await answerQuery(engine, q);
  if (o.tier === 'not-found') continue;
  if (o.tier === 'document') { const r = o.results[0]; console.log(`[document raw ${r.rawScore.toFixed(3)} ${r.matchType}] ${q}\n    → ${r.chunk.sectionTitle} p${r.chunk.printedPage}: ${r.chunk.text.slice(0, 140)}`); }
  else if (o.tier === 'verified') console.log(`[verified ${o.qa.score.toFixed(3)}] ${q}\n    → ${o.qa.row.question}`);
  else console.log(`[${o.tier}] ${q}`);
}

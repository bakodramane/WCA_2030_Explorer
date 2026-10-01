// C3: CI guard. Runs the real cascade over the gold set and the off-topic sets and fails if
// retrieval quality or the guardrail regresses against tests/fixtures/eval-baseline.json.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { answerQuery } from '../src/engine/answer';
import type { RetrievalEngine } from '../src/engine/retrieval';
import { loadEngine, readFixture, scoreOutcome, type GoldItem } from '../scripts/lib/eval-engine';

const baseline = readFixture<{ goldRecall5: number; tuningFalseAnswers: number; heldoutFalseAnswers: number; heldout2FalseAnswers: number }>('eval-baseline.json');

describe('C3 — retrieval quality does not regress', () => {
  let engine: RetrievalEngine;
  beforeAll(async () => { engine = await loadEngine(path.join(process.cwd(), 'public', 'data')); }, 180_000);

  const falseAnswers = async (file: string): Promise<string[]> => {
    const questions = readFixture<{ questions: string[] }>(file).questions;
    const bad: string[] = [];
    for (const q of questions) if ((await answerQuery(engine, q)).tier !== 'not-found') bad.push(q);
    return bad;
  };

  it('full-cascade gold recall@5 stays within 3 points of the baseline', async () => {
    const gold = readFixture<{ items: GoldItem[] }>('gold.json').items;
    let hits = 0;
    for (const item of gold) if (scoreOutcome(item, await answerQuery(engine, item.question)).top5) hits++;
    const recall = hits / gold.length;
    expect(recall, `recall@5 ${(recall * 100).toFixed(1)} % vs baseline ${(baseline.goldRecall5 * 100).toFixed(1)} %`).toBeGreaterThanOrEqual(baseline.goldRecall5 - 0.03);
  }, 180_000);

  it('answers none of the tuning off-topic questions', async () => {
    expect(await falseAnswers('off-topic.json')).toHaveLength(baseline.tuningFalseAnswers);
  }, 180_000);

  it('does not leak more held-out questions than the recorded baseline', async () => {
    expect((await falseAnswers('off-topic-heldout.json')).length).toBeLessThanOrEqual(baseline.heldoutFalseAnswers);
    expect((await falseAnswers('off-topic-heldout2.json')).length).toBeLessThanOrEqual(baseline.heldout2FalseAnswers);
  }, 180_000);

  it('the baseline file matches the committed evaluation report', () => {
    const report = fs.readFileSync(path.join(process.cwd(), 'reports', 'eval-latest.md'), 'utf-8');
    expect(report).toMatch(new RegExp(`all gold \\| 140 \\| [\\d.]+ % \\| [\\d.]+ % \\| ${(baseline.goldRecall5 * 100).toFixed(1)} %`));
  });
});

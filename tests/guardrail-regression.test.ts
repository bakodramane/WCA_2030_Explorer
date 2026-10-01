// A3 / C3 acceptance: run the FULL answer cascade (src/engine/answer.ts — lookups, curated Q&A,
// document search, guardrail; the same code the UI runs) with the REAL offline model and the REAL
// public/data for every off-topic question in the TUNING set. Every one must be REFUSED.
// The held-out sets are never tuned against; tests/eval-regression.test.ts budgets them.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '@xenova/transformers';
import { answerQuery } from '../src/engine/answer';
import { RetrievalEngine } from '../src/engine/retrieval';

// retrieval.ts sets env paths for the browser at import time; re-point the library to the
// committed offline copy under public/ (§0.3) for Node.
(env as Record<string, unknown>).localModelPath = path.join(process.cwd(), 'public', 'models') + path.sep;
(env as Record<string, unknown>).allowRemoteModels = false;
(env as Record<string, unknown>).allowLocalModels = true;

vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
  const m = String(url).match(/data\/([A-Za-z0-9._-]+)$/);
  if (!m) throw new Error(`Unexpected fetch in regression test: ${url}`);
  const file = path.join(process.cwd(), 'public', 'data', m[1]);
  return { json: async () => JSON.parse(fs.readFileSync(file, 'utf-8')) };
}));

const fixture = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'off-topic.json'), 'utf-8'),
) as { questions: string[] };

describe('A3 — guardrail regression: tuning off-topic questions are all refused', () => {
  let engine: RetrievalEngine;

  beforeAll(async () => {
    engine = new RetrievalEngine();
    await engine.init();
  }, 180_000);

  it('fixture holds at least 60 off-topic questions', () => {
    expect(fixture.questions.length).toBeGreaterThanOrEqual(60);
    expect(fixture.questions).toContain('What is the GDP of Nigeria?');
    expect(fixture.questions).toContain('What is the capital of France?');
  });

  for (const q of fixture.questions) {
    it(`refuses: ${q}`, async () => {
      const outcome = await answerQuery(engine, q);
      expect(outcome.tier, `Off-topic question was answered by the ${outcome.tier} tier: «${q}»`).toBe('not-found');
    }, 60_000);
  }
});

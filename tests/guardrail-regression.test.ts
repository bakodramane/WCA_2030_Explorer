// tests/guardrail-regression.test.ts
// A3 acceptance: run the FULL search cascade (curated Q&A tier, section
// search, lexical fallback) with the REAL offline model and the REAL
// public/data/chunks.json + qa.json for every off-topic question in
// tests/fixtures/off-topic.json. Every question must be REFUSED.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '@xenova/transformers';
import { RetrievalEngine } from '../src/engine/retrieval';
import { evaluate } from '../src/engine/guardrail';

// ── Offline data + model wiring ──────────────────────────────────────────────
// retrieval.ts sets env paths for the browser at import time; re-point the
// library to the committed offline copy under public/ (§0.3) for Node.
(env as Record<string, unknown>).localModelPath =
  path.join(process.cwd(), 'public', 'models') + path.sep;
(env as Record<string, unknown>).allowRemoteModels = false;
(env as Record<string, unknown>).allowLocalModels = true;

// Serve public/data/*.json to the engine's fetch() calls from disk.
vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
  const m = String(url).match(/data\/([A-Za-z0-9._-]+)$/);
  if (!m) throw new Error(`Unexpected fetch in regression test: ${url}`);
  const file = path.join(process.cwd(), 'public', 'data', m[1]);
  return {
    json: async () => JSON.parse(fs.readFileSync(file, 'utf-8')),
  };
}));

interface OffTopicFixture {
  questions: string[];
}

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'off-topic.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as OffTopicFixture;

describe('A3 — guardrail regression: off-topic questions are all refused', () => {
  let engine: RetrievalEngine;

  beforeAll(async () => {
    engine = new RetrievalEngine();
    await engine.init();
  }, 180_000);

  it('fixture holds at least 50 off-topic questions', () => {
    expect(fixture.questions.length).toBeGreaterThanOrEqual(50);
    expect(fixture.questions).toContain('What is the GDP of Nigeria?');
    expect(fixture.questions).toContain('What is the capital of France?');
  });

  for (const q of fixture.questions) {
    it(`refuses: ${q}`, async () => {
      // Tier 1 — curated Q&A must not fire.
      const qa = await engine.qaSearch(q);
      expect(qa, `Q&A tier answered an off-topic question: «${q}»`).toBeNull();

      // Tiers 2+3 — document search + guardrail, exactly as the UI cascade.
      const sections = await engine.sectionSearch(q, 10);
      const semantic = sections
        .filter(s => s.topChunks.length > 0)
        .map(s => ({
          chunk:     s.topChunks[0].chunk,
          score:     s.score,
          rawScore:  s.rawScore,
          matchType: 'semantic' as const,
        }));
      const response = evaluate(
        semantic,
        () => engine.lexicalSearch(q, 10),
        'enum',
      );
      expect(
        response.answered,
        `Off-topic question was answered (raw best score ` +
        `${semantic[0]?.rawScore?.toFixed(3) ?? 'n/a'}): «${q}»`,
      ).toBe(false);
    }, 60_000);
  }
});

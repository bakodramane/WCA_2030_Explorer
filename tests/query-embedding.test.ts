// E2: each distinct query text is embedded once per search, whichever tiers use it.
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { answerQuery } from '../src/engine/answer';
import type { RetrievalEngine } from '../src/engine/retrieval';
import { loadEngine } from '../scripts/lib/eval-engine';

describe('E2 — query embedding is shared', () => {
  let engine: RetrievalEngine;
  let calls = 0;

  beforeAll(async () => {
    engine = await loadEngine(path.join(process.cwd(), 'public', 'data'));
    const internals = engine as unknown as { extractor: (...args: unknown[]) => Promise<unknown> };
    const original = internals.extractor;
    internals.extractor = (...args: unknown[]) => { calls++; return original(...args); };
  }, 180_000);

  it('embeds a query once even though the curated tier and document search both need it', async () => {
    calls = 0;
    await answerQuery(engine, 'How is a plot related to a field and a parcel?');
    expect(calls).toBe(1);
  }, 60_000);

  it('repeating the same query reuses the cached vector', async () => {
    calls = 0;
    await answerQuery(engine, 'How is a plot related to a field and a parcel?');
    await answerQuery(engine, 'How is a plot related to a field and a parcel?');
    expect(calls).toBe(0);
  }, 60_000);

  it('a query that is expanded (modality) needs two texts, the raw one for the curated tier and the expanded one for search', async () => {
    calls = 0;
    await answerQuery(engine, 'modality of planting seeds in winter');
    expect(calls).toBe(2);
  }, 60_000);

  it('the id → chunk map is built once in init(), not per lexical search', () => {
    const internals = engine as unknown as { chunkById: Map<string, unknown>; chunks: unknown[] };
    expect(internals.chunkById.size).toBe(internals.chunks.length);
  });
});

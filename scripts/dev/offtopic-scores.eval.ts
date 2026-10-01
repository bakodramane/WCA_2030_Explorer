// Prints the highest section-level raw score reached by each off-topic question (what the guardrail compares).
import fs from 'node:fs';
import path from 'node:path';
import { it, vi } from 'vitest';
import { env } from '@xenova/transformers';
import { RetrievalEngine } from '../../src/engine/retrieval';
(env as Record<string, unknown>).localModelPath = path.join(process.cwd(), 'public', 'models') + path.sep;
(env as Record<string, unknown>).allowRemoteModels = false;
vi.stubGlobal('fetch', vi.fn(async (url: unknown) => ({ json: async () => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', String(url).match(/data\/([\w.-]+)$/)![1]), 'utf-8')) })));
it('scores', async () => {
  const e = new RetrievalEngine(); await e.init();
  const file = process.env.SET ?? 'off-topic.json';
  const qs = (JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', file), 'utf-8')) as { questions: string[] }).questions;
  const rows: Array<[number, number, string]> = [];
  for (const q of qs) {
    const s = await e.sectionSearch(q, 10);
    const chunkBest = (await e.semanticSearch(q, 1))[0].rawScore;
    rows.push([Math.max(...s.map(x => x.rawScore)), chunkBest, q]);
  }
  rows.sort((a, b) => b[0] - a[0]);
  console.log(rows.slice(0, 8).map(r => `${r[0].toFixed(3)} (chunk ${r[1].toFixed(3)}) ${r[2]}`).join('\n'));
});

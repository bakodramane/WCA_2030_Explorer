import fs from 'node:fs';
import path from 'node:path';
import { it, vi } from 'vitest';
import { env } from '@xenova/transformers';
import { RetrievalEngine } from '../../src/engine/retrieval';
(env as Record<string, unknown>).localModelPath = path.join(process.cwd(), 'public', 'models') + path.sep;
(env as Record<string, unknown>).allowRemoteModels = false;
vi.stubGlobal('fetch', vi.fn(async (url: unknown) => ({ json: async () => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', String(url).match(/data\/([\w.-]+)$/)![1]), 'utf-8')) })));
it('leak', async () => {
  const e = new RetrievalEngine(); await e.init();
  const q = process.env.Q ?? 'What is the most popular social media platform?';
  const s = await e.sectionSearch(q, 5);
  for (const r of s) console.log(r.rawScore.toFixed(3), r.score.toFixed(3), r.sectionTitle, '|', r.topChunks.map(c => `${c.rawScore.toFixed(3)} p${c.chunk.printedPage} ${c.chunk.text.slice(0, 60)}`).join(' || '));
});

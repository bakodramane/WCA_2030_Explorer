// C0.5 probe: recall@5, document-tier page accuracy, short-query answers, and
// off-topic false-answer rate. Run with `npm run probe` (loads the real offline model).
import fs from 'node:fs';
import path from 'node:path';
import { it, vi } from 'vitest';
import { env } from '@xenova/transformers';
import { RetrievalEngine } from '../../src/engine/retrieval';
import { evaluate } from '../../src/engine/guardrail';
import type { RankedResult } from '../../src/engine/types';

(env as Record<string, unknown>).localModelPath = path.join(process.cwd(), 'public', 'models') + path.sep;
(env as Record<string, unknown>).allowRemoteModels = false;
(env as Record<string, unknown>).allowLocalModels = true;

vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
  const name = String(url).match(/data\/([A-Za-z0-9._-]+)$/)?.[1];
  if (!name) throw new Error(`Unexpected fetch: ${url}`);
  return { json: async () => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', name), 'utf-8')) };
}));

const SHORT_QUERIES = [
  'fallow', 'aquaculture', 'land tenure', 'reference period livestock', 'irrigation methods',
  'holder', 'sex of holder', 'machinery ownership', 'crop residue', 'intercropping',
  'modular approach', 'community-level data', 'tabulation', 'census frame', 'threshold for small holdings',
];

const near = (r: RankedResult, page: number): boolean =>
  r.chunk.printedPage <= page + 1 && r.chunk.printedPageEnd >= page - 1;

const pct = (n: number, d: number): string => `${n}/${d} (${(100 * n / d).toFixed(0)}%)`;

it('probe', async () => {
  const engine = new RetrievalEngine();
  await engine.init();

  /** Document tier exactly as the UI runs it (Q&A tier bypassed). */
  const documentTier = async (query: string): Promise<{ answered: boolean; results: RankedResult[] }> => {
    const sections = await engine.sectionSearch(query, 10);
    const semantic = sections.filter(s => s.topChunks.length > 0).map(s => ({
      chunk: s.topChunks[0].chunk, score: s.score, rawScore: s.rawScore, matchType: 'semantic' as const,
    }));
    const response = evaluate(semantic, () => engine.lexicalSearch(query, 10), 'enum');
    return { answered: response.answered, results: response.results ?? [] };
  };

  const qa = engine.getAllQa().filter((_, i) => i % 8 === 0);
  let cosHits = 0, boostHits = 0, docHits = 0, docAnswered = 0;
  for (const row of qa) {
    const page = Number(row.page_number);
    const ranked = await engine.semanticSearch(row.question, 10_000);
    if (ranked.slice(0, 5).some(r => near(r, page))) boostHits++;
    if ([...ranked].sort((a, b) => b.rawScore - a.rawScore).slice(0, 5).some(r => near(r, page))) cosHits++;
    const doc = await documentTier(row.question);
    if (doc.answered) docAnswered++;
    if (doc.results.slice(0, 5).some(r => near(r, page))) docHits++;
  }

  const shortRefused: string[] = [];
  for (const q of SHORT_QUERIES) if (!(await documentTier(q)).answered) shortRefused.push(q);

  const readOffTopic = (name: string): string[] => {
    const file = path.join(process.cwd(), 'tests', 'fixtures', name);
    return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as { questions: string[] }).questions : [];
  };
  const offTopicSets: Array<[string, string[]]> = [['tuning (off-topic.json)', readOffTopic('off-topic.json')], ['held-out', readOffTopic('off-topic-heldout.json')]];
  const falseAnswers: string[] = [];
  const falseRates: string[] = [];
  for (const [label, questions] of offTopicSets) {
    let bad = 0;
    for (const q of questions) {
      if (await engine.qaSearch(q) || (await documentTier(q)).answered) { bad++; falseAnswers.push(q); }
    }
    if (questions.length) falseRates.push(`${label}: ${pct(bad, questions.length)}`);
  }

  console.log([
    '── PROBE ─────────────────────────────────────────────',
    `chunks                        : ${(await (await fetch('data/chunks.json')).json()).length}`,
    `sample size                   : ${qa.length} (every 8th Q&A row)`,
    `chunk ranking, pure cosine @5 : ${pct(cosHits, qa.length)}   (brief's "raw" baseline)`,
    `chunk ranking, boosted @5     : ${pct(boostHits, qa.length)}`,
    `document tier answered        : ${pct(docAnswered, qa.length)}`,
    `document tier page-correct @5 : ${pct(docHits, qa.length)}`,
    `short queries refused (doc)   : ${shortRefused.length}/${SHORT_QUERIES.length}  ${JSON.stringify(shortRefused)}`,
    `off-topic false answers       : ${falseRates.join('; ')}`,
    falseAnswers.length ? `  leaked: ${JSON.stringify(falseAnswers)}` : '',
    '──────────────────────────────────────────────────────',
  ].filter(Boolean).join('\n'));
});

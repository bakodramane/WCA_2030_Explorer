// Loads the real retrieval engine under Node (no browser) and matches outcomes against gold items.
import fs from 'node:fs';
import path from 'node:path';
import { env } from '@xenova/transformers';
import { parseExcerpts } from '../../src/engine/excerpts';
import type { AnswerOutcome } from '../../src/engine/answer';
import { RetrievalEngine } from '../../src/engine/retrieval';
import type { Chunk, RankedResult } from '../../src/engine/types';

export interface GoldItem {
  id: string;
  kind: 'reworded' | 'new' | 'short';
  question: string;
  expectedPrintedPage?: number;
  expectedParagraphs?: string[];
  mustContain?: string;
}

export function readFixture<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf-8')) as T;
}

/** The engine fetches `${BASE_URL}data/<name>`; serve those from `dataDir` and the model from public/models. */
export async function loadEngine(dataDir: string): Promise<RetrievalEngine> {
  (env as Record<string, unknown>).localModelPath = path.join(process.cwd(), 'public', 'models') + path.sep;
  (env as Record<string, unknown>).allowRemoteModels = false;
  (env as Record<string, unknown>).allowLocalModels = true;
  globalThis.fetch = (async (url: unknown) => {
    const file = path.join(dataDir, path.basename(String(url)));
    if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
    const bytes = (): ArrayBuffer => { const b = fs.readFileSync(file); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
    return { json: async () => JSON.parse(fs.readFileSync(file, 'utf-8')), arrayBuffer: async () => bytes() };
  }) as unknown as typeof fetch;
  const engine = new RetrievalEngine();
  await engine.init();
  return engine;
}

/** A chunk answers an item when it holds an expected paragraph or its pages come within one page of the expected page. */
export function chunkHits(item: GoldItem, chunk: Chunk): boolean {
  if (item.kind === 'short') return new RegExp(item.mustContain!, 'i').test(chunk.text);
  if (item.expectedParagraphs?.some(p => chunk.paragraphs.includes(p))) return true;
  const page = item.expectedPrintedPage!;
  return chunk.printedPage <= page + 1 && chunk.printedPageEnd >= page - 1;
}

/** Strict version for "is the top citation right": the cited start page itself is within one page of the answer. */
export function citationCorrect(item: GoldItem, chunk: Chunk): boolean {
  if (item.kind === 'short') return new RegExp(item.mustContain!, 'i').test(chunk.text);
  if (item.expectedParagraphs?.some(p => chunk.paragraphs.includes(p))) return true;
  return Math.abs(chunk.printedPage - item.expectedPrintedPage!) <= 1;
}

/** Whitespace- and case-insensitive containment of a new question's answer phrase. */
function phraseIn(item: GoldItem, text: string): boolean {
  const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return item.kind === 'new' && norm(text).includes(norm(item.mustContain!));
}

export interface ItemResult {
  item: GoldItem;
  tier: AnswerOutcome['tier'];
  answered: boolean;
  top1: boolean;
  top5: boolean;
  topCitation: boolean;
}

export function scoreOutcome(item: GoldItem, outcome: AnswerOutcome): ItemResult {
  const base = { item, tier: outcome.tier, answered: outcome.tier !== 'not-found' };
  const miss = { ...base, top1: false, top5: false, topCitation: false };
  const pattern = item.kind === 'short' ? new RegExp(item.mustContain!, 'i') : null;
  switch (outcome.tier) {
    case 'document': {
      const hits = outcome.results.slice(0, 5).map((r: RankedResult) => chunkHits(item, r.chunk));
      return { ...base, top1: hits[0], top5: hits.some(Boolean), topCitation: citationCorrect(item, outcome.results[0].chunk) };
    }
    case 'verified': {
      const row = outcome.qa.row;
      const ok = pattern ? pattern.test(`${row.question} ${row.excerpt}`) : parseExcerpts(row.excerpt, row.page_number).some(p => Math.abs(p.printedPage - item.expectedPrintedPage!) <= 1);
      return { ...base, top1: ok, top5: ok, topCitation: ok };
    }
    case 'glossary': {
      const text = `${outcome.entry.term} ${outcome.entry.definition}`;
      const ok = pattern ? pattern.test(text) : phraseIn(item, text);
      return { ...base, top1: ok, top5: ok, topCitation: ok };
    }
    case 'item': {
      // An item card shows the item's verbatim description, so it answers when that text holds the answer.
      const text = `${outcome.item.name} ${outcome.item.description}`;
      const ok = pattern ? pattern.test(text)
        : item.kind === 'new' ? phraseIn(item, text)
        : Math.abs(outcome.item.page - item.expectedPrintedPage!) <= 1;
      return { ...base, top1: ok, top5: ok, topCitation: ok };
    }
    default:
      return miss;
  }
}

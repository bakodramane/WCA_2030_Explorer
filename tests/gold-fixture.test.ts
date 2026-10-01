// C1: structure and provenance of the evaluation fixtures.
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { readCsvRecords } from '../scripts/lib/csv';
import { findStartPages, loadSourceText, type SourceText } from '../scripts/lib/source-text';

interface GoldItem {
  id: string;
  kind: 'reworded' | 'new' | 'short';
  question: string;
  expectedPrintedPage?: number;
  expectedParagraphs?: string[];
  mustContain?: string;
  sourceQuestion?: string;
}

const fixture = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests', 'fixtures', name), 'utf-8'));
const gold = (fixture('gold.json') as { items: GoldItem[] }).items;
const tuning = (fixture('off-topic.json') as { questions: string[] }).questions;
const heldout = fixture('off-topic-heldout.json') as { questions: string[]; nearDomain: string[] };

describe('C1 — gold set', () => {
  let source: SourceText;
  beforeAll(async () => { source = await loadSourceText(); }, 60_000);

  it('holds 80 reworded, 40 new, and 20 short in-domain items with unique ids and questions', () => {
    expect(gold.filter(g => g.kind === 'reworded')).toHaveLength(80);
    expect(gold.filter(g => g.kind === 'new')).toHaveLength(40);
    expect(gold.filter(g => g.kind === 'short')).toHaveLength(20);
    expect(new Set(gold.map(g => g.id)).size).toBe(gold.length);
    expect(new Set(gold.map(g => g.question.toLowerCase())).size).toBe(gold.length);
  });

  it('reworded questions are not copies of any stored Q&A question', () => {
    const stored = new Set(readCsvRecords(path.join(process.cwd(), 'data', 'wca-qa.csv')).records.map(r => r.question.toLowerCase().trim()));
    for (const g of gold.filter(x => x.kind === 'reworded')) {
      expect(stored.has(g.question.toLowerCase().trim()), `${g.id}: ${g.question}`).toBe(false);
      expect(g.question.toLowerCase().trim(), g.id).not.toBe(g.sourceQuestion!.toLowerCase().trim());
    }
  });

  it('each new question\'s answer phrase occurs in the PDF on (or one page after) its expected page', () => {
    for (const g of gold.filter(x => x.kind === 'new')) {
      const pages = findStartPages(source, g.mustContain!);
      expect(pages.some(p => Math.abs(p - g.expectedPrintedPage!) <= 1), `${g.id} ${g.mustContain} on ${pages} vs ${g.expectedPrintedPage}`).toBe(true);
    }
  });

  it('every short query\'s expected term occurs in the document', () => {
    const all = [...source.pages.values()].join(' ').toLowerCase();
    for (const g of gold.filter(x => x.kind === 'short')) {
      expect(new RegExp(g.mustContain!, 'i').test(all), g.id).toBe(true);
    }
  });
});

describe('C1 — off-topic sets', () => {
  it('the tuning set has at least 60 questions and the held-out set at least 30, with no overlap', () => {
    expect(tuning.length).toBeGreaterThanOrEqual(60);
    expect(heldout.questions.length).toBeGreaterThanOrEqual(30);
    const lower = new Set(tuning.map(q => q.toLowerCase()));
    for (const q of heldout.questions) expect(lower.has(q.toLowerCase()), q).toBe(false);
  });

  it('the held-out set contains at least 10 near-domain traps, all part of its question list', () => {
    expect(heldout.nearDomain.length).toBeGreaterThanOrEqual(10);
    for (const q of heldout.nearDomain) expect(heldout.questions).toContain(q);
  });
});

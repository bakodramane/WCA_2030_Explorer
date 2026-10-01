// OD.2: excerpts flagged needs_owner_review are withheld until the owner approves them.
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { answerQuery } from '../src/engine/answer';
import type { RetrievalEngine } from '../src/engine/retrieval';
import { documentPassageBlockHtml } from '../src/ui/qa-block';
import { readCsvRecords } from '../scripts/lib/csv';
import { loadEngine } from '../scripts/lib/eval-engine';

const { records } = readCsvRecords(path.join(process.cwd(), 'data', 'wca-qa.csv'));
const withheld = records.filter(r => r.needs_owner_review === 'yes' && r.approved_by !== 'owner');

describe('OD.2 — unapproved excerpts are not served', () => {
  let engine: RetrievalEngine;
  beforeAll(async () => { engine = await loadEngine(path.join(process.cwd(), 'public', 'data')); }, 180_000);

  it('the CSV flags match the repair log, and qa.json marks exactly those rows unservable', () => {
    const log = readCsvRecords(path.join(process.cwd(), 'reports', 'qa-excerpt-repairs.csv')).records;
    const flaggedInLog = log.filter(l => l.needs_owner_review === 'yes').map(l => l.question).sort();
    expect(records.filter(r => r.needs_owner_review === 'yes').map(r => r.question).sort()).toEqual(flaggedInLog);
    const unservable = engine.getAllQa().filter(r => r.servable === false).map(r => r.question).sort();
    expect(unservable).toEqual(withheld.map(r => r.question).sort());
    expect(withheld.length).toBeGreaterThan(0);
  });

  it('qaSearch never returns a withheld row, even for its own exact question', async () => {
    const blocked = new Set(withheld.map(r => r.question));
    for (const q of blocked) {
      const hit = await engine.qaSearch(q);
      expect(hit === null || !blocked.has(hit.row.question), q).toBe(true);
    }
  }, 120_000);

  it('flagged questions still get a cited answer from the document tier', async () => {
    for (const q of [
      'What are the 12 themes of the WCA 2030?',
      'What is data archiving in the context of an agricultural census?',
      'What is data disclosure control and why is it needed in census tabulations?',
    ]) {
      expect(withheld.some(r => r.question === q), `${q} should be flagged`).toBe(true);
      const outcome = await answerQuery(engine, q);
      expect(outcome.tier, q).not.toBe('not-found');
      // Another, approved curated row may legitimately answer; a withheld one never may.
      if (outcome.tier === 'verified') expect(withheld.some(r => r.question === outcome.qa.row.question), q).toBe(false);
    }
  }, 60_000);

  it('the reveal block for a withheld row shows a cited passage, or says none was found', () => {
    expect(documentPassageBlockHtml(null)).toContain('No passage');
    const html = documentPassageBlockHtml({ paragraphs: ['10.29'], sectionTitle: 'Data archiving', printedPage: 124, printedPageEnd: 124, text: 'Data archiving is…' } as never);
    expect(html).toContain('§10.29 · Data archiving · p. 124');
  });
});

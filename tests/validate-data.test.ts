import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateAll } from '../scripts/validate-data';
import { readCsvRecords } from '../scripts/lib/csv';

describe('B4 — committed data is verbatim and correctly cited', () => {
  it('passes every validate-data check against the PDF', async () => {
    const failures = await validateAll();
    expect(failures.map(f => `${f.dataset}/${f.check}: ${f.id}`)).toEqual([]);
  }, 120_000);

  it('logs every excerpt repair, flagging low-confidence ones for owner review', () => {
    const { records } = readCsvRecords(path.join(process.cwd(), 'reports', 'qa-excerpt-repairs.csv'));
    expect(records.length).toBeGreaterThanOrEqual(130);
    for (const r of records) {
      expect(['yes', 'no']).toContain(r.needs_owner_review);
      expect(r.method).not.toBe('unrepaired');
      expect(r.new_page).toMatch(/^\d+$/);
    }
    expect(records.some(r => r.needs_owner_review === 'yes')).toBe(true);
  });

  it('keeps qa.json in step with the CSV', () => {
    const json = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'qa.json'), 'utf-8')) as unknown[];
    const { records } = readCsvRecords(path.join(process.cwd(), 'data', 'wca-qa.csv'));
    expect(json).toHaveLength(records.length);
  });
});

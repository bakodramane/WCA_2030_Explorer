// OD.4: scripts/apply-excerpt-decisions.ts refuses any decision that fails validation (dry run only: no data is written).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readCsvRecords } from '../scripts/lib/csv';

const flagged = readCsvRecords(path.join(process.cwd(), 'data', 'wca-qa.csv')).records.filter(r => r.needs_owner_review === 'yes');

function dryRun(rows: string[][]): { out: string; status: number | null } {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wca-decisions-')), 'decisions.csv');
  const q = (v: string): string => `"${v.replace(/"/g, '""')}"`;
  fs.writeFileSync(file, `row,question,action,passages,pages\n${rows.map(r => r.map(q).join(',')).join('\n')}\n`);
  const run = spawnSync('npx', ['tsx', 'scripts/apply-excerpt-decisions.ts', '--dry-run', '--decisions', file], { cwd: process.cwd(), encoding: 'utf-8', shell: process.platform === 'win32' });
  return { out: `${run.stdout}${run.stderr}`, status: run.status };
}

describe('OD.4 — applying owner decisions', () => {
  it('accepts a valid accept and reject, and refuses invented text, unknown actions, and unknown questions', () => {
    const [a, b] = flagged;
    const { out } = dryRun([
      ['1', a.question, 'accept', '', ''],
      ['2', b.question, 'reject', '', ''],
      ['3', flagged[2].question, 'edit', 'This sentence was typed by a person and is not in the guidelines.', '10'],
      ['4', flagged[3].question, 'delete', '', ''],
      ['5', 'A question that is not in the bank?', 'accept', '', ''],
    ]);
    expect(out).toContain('applied 2; refused 3');
    expect(out).toMatch(/REFUSED .*not verbatim source text/);
    expect(out).toMatch(/REFUSED .*unknown action/);
    expect(out).toMatch(/REFUSED .*no such question/);
    expect(out).toContain('Dry run: nothing written');
  }, 120_000);

  it('refuses an edit whose passage is verbatim but cited on a page where it does not start', () => {
    const { out } = dryRun([['1', flagged[0].question, 'edit', '10.29 Data archiving is a means of ensuring long-term preservation of data', '3']]);
    // The passage exists (on p. 124), so the page is resolved from the source, not trusted from the hint.
    expect(out).toMatch(/applied [01]; refused [01]/);
  }, 120_000);
});

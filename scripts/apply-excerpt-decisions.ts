// OD.4: apply the owner's decisions (data/excerpt-decisions.csv, exported by scripts/dev/review-excerpts.html)
// to data/wca-qa.csv. A decision that fails validation is refused and reported; the rest are applied.
//   accept       keep the proposed excerpt            → needs_owner_review=no, approved_by=owner
//   alternative  replace with the chosen passage(s)    → same
//   edit         replace with the selected passage(s)  → same
//   reject       keep the question out of the Q&A tier → needs_owner_review=yes, approved_by=rejected
// After writing it re-runs build-qa and validate-data. Usage: npx tsx scripts/apply-excerpt-decisions.ts [--dry-run] [--decisions <file>]
import { execSync } from 'node:child_process';
import path from 'node:path';
import { joinPassages, splitPages, splitPassages } from '../src/engine/excerpts';
import { readCsvRecords, writeCsvRecords } from './lib/csv';
import { findStartPages, loadSourceText } from './lib/source-text';
import { checkQaRows } from './lib/validate-checks';

const ROOT = process.cwd();
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const nearest = (hits: number[], hint: number): number => hits.reduce((b, h) => Math.abs(h - hint) < Math.abs(b - hint) ? h : b, hits[0]);

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const decisionsPath = path.resolve(arg('decisions', path.join('data', 'excerpt-decisions.csv')));
  const csvPath = path.join(ROOT, 'data', 'wca-qa.csv');
  const { headers, records } = readCsvRecords(csvPath);
  const { records: decisions } = readCsvRecords(decisionsPath);
  const source = await loadSourceText();
  const refused: string[] = [];
  let applied = 0;

  for (const d of decisions) {
    const index = records.findIndex(r => r.question === d.question);
    const row = index >= 0 ? records[index] : undefined;
    if (!row) { refused.push(`${d.question}: no such question in data/wca-qa.csv`); continue; }
    if (!['accept', 'alternative', 'edit', 'reject'].includes(d.action)) { refused.push(`${d.question}: unknown action "${d.action}"`); continue; }

    if (d.action === 'reject') { row.needs_owner_review = 'yes'; row.approved_by = 'rejected'; applied++; continue; }

    let excerpt = row.excerpt;
    let pageNumber = row.page_number;
    if (d.action !== 'accept') {
      const passages = splitPassages(d.passages).map(p => p.replace(/\s+/g, ' ').trim());
      const hints = splitPages(d.pages);
      const pages: number[] = [];
      let bad = '';
      passages.forEach((p, i) => {
        const hits = findStartPages(source, p);
        if (hits.length === 0) bad = `passage ${i + 1} is not verbatim source text`;
        else pages.push(nearest(hits, hints[i] ?? hits[0]));
      });
      if (!passages.length || bad) { refused.push(`${d.question}: ${bad || 'no passages'}`); continue; }
      excerpt = joinPassages(passages);
      pageNumber = pages.join('; ');
    }
    const proposed = { question: row.question, excerpt, page_number: pageNumber };
    const failures = checkQaRows(source, [proposed]);
    if (failures.length) { refused.push(`${d.question}: ${failures.map(f => `${f.check} (${f.detail})`).join('; ')}`); continue; }
    Object.assign(row, { excerpt, page_number: pageNumber, needs_owner_review: 'no', approved_by: 'owner' });
    applied++;
  }

  console.log(`Decisions: ${decisions.length}; applied ${applied}; refused ${refused.length}.`);
  for (const message of refused) console.error(`  REFUSED ${message}`);
  if (dryRun) { console.log('Dry run: nothing written.'); return; }
  if (applied === 0) return;

  writeCsvRecords(csvPath, headers, records);
  execSync('npx tsx scripts/build-qa.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/write-meta.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/validate-data.ts', { stdio: 'inherit' });
  if (refused.length) process.exitCode = 1;
}

main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });

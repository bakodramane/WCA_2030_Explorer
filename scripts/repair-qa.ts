// B4-R: make every curated excerpt in data/wca-qa.csv a verbatim passage of the PDF
// and every page_number the printed page where it starts. Every change is logged in
// reports/qa-excerpt-repairs.csv; low-confidence repairs carry needs_owner_review=yes.
// Usage: npx tsx scripts/repair-qa.ts [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { formatCsv, readCsvRecords, writeCsvRecords, type CsvRecord } from './lib/csv';
import { buildSourceIndex, repairExcerpt } from './lib/excerpt-repair';
import { findStartPages, loadSourceText } from './lib/source-text';
import { QA_PAGE_TOLERANCE } from './lib/validate-checks';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'wca-qa.csv');
const LOG_PATH = path.join(ROOT, 'reports', 'qa-excerpt-repairs.csv');
const LOG_HEADERS = [
  'row', 'question', 'old_page', 'new_page', 'method', 'confidence', 'coverage',
  'length_ratio', 'needs_owner_review', 'old_excerpt', 'new_excerpt',
];

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const source = await loadSourceText();
  const index = buildSourceIndex(source);
  const { headers, records } = readCsvRecords(CSV_PATH);
  for (const column of ['needs_owner_review', 'approved_by']) if (!headers.includes(column)) headers.push(column);
  const log: CsvRecord[] = [];
  let unrepaired = 0;

  records.forEach((row, i) => {
    const oldPage = Number(row.page_number);
    const hits = findStartPages(source, row.excerpt);
    const entry = { row: String(i + 2), question: row.question, old_page: row.page_number, old_excerpt: row.excerpt };

    if (hits.length > 0) {
      // Verbatim already: only the page may be wrong. Fix it when no occurrence is within tolerance.
      if (hits.some(hit => Math.abs(hit - oldPage) <= QA_PAGE_TOLERANCE)) return;
      const page = hits.reduce((best, hit) => Math.abs(hit - oldPage) < Math.abs(best - oldPage) ? hit : best, hits[0]);
      row.page_number = String(page);
      log.push({ ...entry, new_page: String(page), method: 'page-only', confidence: 'high', coverage: '1', length_ratio: '1', needs_owner_review: 'no', new_excerpt: row.excerpt });
      return;
    }

    const repair = repairExcerpt(index, row.excerpt);
    if (!repair) {
      unrepaired++;
      log.push({ ...entry, new_page: '', method: 'unrepaired', confidence: 'low', coverage: '0', length_ratio: '', needs_owner_review: 'yes', new_excerpt: '' });
      return;
    }
    row.excerpt = repair.text;
    if (repair.confidence === 'low') { row.needs_owner_review = 'yes'; row.approved_by = ''; }
    row.page_number = String(repair.page);
    log.push({
      ...entry,
      new_page: String(repair.page),
      method: repair.method,
      confidence: repair.confidence,
      coverage: String(repair.coverage),
      length_ratio: String(repair.lengthRatio),
      needs_owner_review: repair.confidence === 'low' ? 'yes' : 'no',
      new_excerpt: repair.text,
    });
  });

  const byMethod = new Map<string, number>();
  for (const entry of log) {
    const key = `${entry.method}/${entry.needs_owner_review === 'yes' ? 'review' : 'ok'}`;
    byMethod.set(key, (byMethod.get(key) ?? 0) + 1);
  }
  console.log(`Repairs: ${log.length} (${[...byMethod].map(([k, n]) => `${k}: ${n}`).join(', ') || 'none'})`);
  if (log.length === 0 || dryRun) {
    console.log(dryRun ? 'Dry run: nothing written.' : 'Nothing to repair.');
    return;
  }

  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, formatCsv(LOG_HEADERS, log, false), 'utf-8');
  writeCsvRecords(CSV_PATH, headers, records);
  console.log(`Wrote ${path.relative(ROOT, CSV_PATH)} and ${path.relative(ROOT, LOG_PATH)}`);
  if (unrepaired > 0) {
    console.error(`${unrepaired} excerpt(s) could not be matched to the PDF; fix them by hand.`);
    process.exitCode = 1;
  }
}

main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });

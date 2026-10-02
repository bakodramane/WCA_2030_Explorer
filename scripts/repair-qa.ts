// B4-R: make every curated excerpt in data/wca-qa.csv a verbatim passage of the PDF
// and every page_number the printed page where it starts. Every change is logged in
// reports/qa-excerpt-repairs.csv; low-confidence repairs carry needs_owner_review=yes.
// Usage: npx tsx scripts/repair-qa.ts [--dry-run] [--exact] [--log=reports/other-log.csv]
// --exact sets every page to the passage's exact start page (no ±1 tolerance), e.g. for a new edition.
// Use --log when carrying the data over to a new PDF edition, so the B4-R review history in
// reports/qa-excerpt-repairs.csv (read by the owner review page) is kept.
import fs from 'node:fs';
import path from 'node:path';
import { formatCsv, readCsvRecords, writeCsvRecords, type CsvRecord } from './lib/csv';
import { buildSourceIndex, repairExcerpt } from './lib/excerpt-repair';
import { findStartPages, loadSourceText } from './lib/source-text';
import { QA_PAGE_TOLERANCE } from './lib/validate-checks';
import { joinPassages, splitPages, splitPassages } from '../src/engine/excerpts';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'wca-qa.csv');
const LOG_ARG = process.argv.find(a => a.startsWith('--log='))?.slice('--log='.length);
const LOG_PATH = LOG_ARG ? path.resolve(ROOT, LOG_ARG) : path.join(ROOT, 'reports', 'qa-excerpt-repairs.csv');
const LOG_HEADERS = [
  'row', 'question', 'old_page', 'new_page', 'method', 'confidence', 'coverage',
  'length_ratio', 'needs_owner_review', 'old_excerpt', 'new_excerpt',
];

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const tolerance = process.argv.includes('--exact') ? 0 : QA_PAGE_TOLERANCE;
  const source = await loadSourceText();
  const index = buildSourceIndex(source);
  const { headers, records } = readCsvRecords(CSV_PATH);
  for (const column of ['needs_owner_review', 'approved_by']) if (!headers.includes(column)) headers.push(column);
  const log: CsvRecord[] = [];
  let unrepaired = 0;

  records.forEach((row, i) => {
    const entry = { row: String(i + 2), question: row.question, old_page: row.page_number, old_excerpt: row.excerpt };
    // OD.3: an excerpt may hold several passages, each with its own page. Repair passage by passage.
    const passages = splitPassages(row.excerpt);
    const oldPages = splitPages(row.page_number);
    const results = passages.map((passage, k) => {
      const oldPage = oldPages[k] ?? oldPages[oldPages.length - 1] ?? 0;
      const hits = findStartPages(source, passage);
      if (hits.length > 0) {
        // Verbatim already: only the page may be wrong. Fix it when no occurrence is within tolerance.
        if (hits.some(hit => Math.abs(hit - oldPage) <= tolerance)) return { text: passage, page: oldPage, method: 'unchanged' as const };
        const page = hits.reduce((best, hit) => Math.abs(hit - oldPage) < Math.abs(best - oldPage) ? hit : best, hits[0]);
        return { text: passage, page, method: 'page-only' as const };
      }
      const repair = repairExcerpt(index, passage);
      if (!repair) return null;
      return { text: repair.text, page: repair.page, method: repair.method, confidence: repair.confidence, coverage: repair.coverage, lengthRatio: repair.lengthRatio };
    });

    if (results.some(r => r === null)) {
      unrepaired++;
      log.push({ ...entry, new_page: '', method: 'unrepaired', confidence: 'low', coverage: '0', length_ratio: '', needs_owner_review: 'yes', new_excerpt: '' });
      return;
    }
    const done = results as NonNullable<(typeof results)[number]>[];
    if (done.every(r => r.method === 'unchanged')) return;

    const textRepairs = done.filter(r => r.method !== 'unchanged' && r.method !== 'page-only') as Array<{ method: string; confidence: string; coverage: number; lengthRatio: number }>;
    const low = textRepairs.some(r => r.confidence === 'low');
    row.excerpt = passages.length > 1 ? joinPassages(done.map(r => r.text)) : done[0].text;
    row.page_number = done.map(r => String(r.page)).join('; ');
    if (low) { row.needs_owner_review = 'yes'; row.approved_by = ''; }
    log.push({
      ...entry,
      new_page: row.page_number,
      method: textRepairs.length ? [...new Set(textRepairs.map(r => r.method))].join('+') : 'page-only',
      confidence: low ? 'low' : 'high',
      coverage: textRepairs.length ? String(Math.min(...textRepairs.map(r => r.coverage))) : '1',
      length_ratio: textRepairs.length ? String(Math.max(...textRepairs.map(r => r.lengthRatio))) : '1',
      needs_owner_review: low ? 'yes' : 'no',
      new_excerpt: row.excerpt,
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

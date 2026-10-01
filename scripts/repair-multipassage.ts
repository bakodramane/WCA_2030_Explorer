// OD.3: (1) trim heading text from the start and end of every passage; (2) re-repair flagged rows
// whose original excerpt was stitched from separate places as multi-passage excerpts instead of one
// bridged span. Needs-review flags are never cleared here; only the owner approves (OD.4).
// Usage: npx tsx scripts/repair-multipassage.ts [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { joinPassages, parseExcerpts } from '../src/engine/excerpts';
import { formatCsv, readCsvRecords, writeCsvRecords, type CsvRecord } from './lib/csv';
import { buildSourceIndex, proposePassages, trimHeadings, type SourceToken } from './lib/excerpt-repair';
import { findStartPages, loadSourceText } from './lib/source-text';

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, 'data', 'wca-qa.csv');
const LOG_PATH = path.join(ROOT, 'reports', 'qa-excerpt-repairs.csv');
const LOG_HEADERS = ['row', 'question', 'old_page', 'new_page', 'method', 'confidence', 'coverage', 'length_ratio', 'needs_owner_review', 'old_excerpt', 'new_excerpt', 'coverage_before', 'previous_method'];
const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const source = await loadSourceText();
  const index = buildSourceIndex(source);
  const { headers, records } = readCsvRecords(CSV_PATH);
  const { records: log } = readCsvRecords(LOG_PATH);
  const logByRow = new Map(log.map(entry => [Number(entry.row), entry]));
  let multi = 0, trimmed = 0;

  records.forEach((row, i) => {
    const rowNumber = i + 2;
    const entry = logByRow.get(rowNumber);
    const flagged = row.needs_owner_review === 'yes' && row.approved_by !== 'owner';
    const oldExcerpt = entry?.old_excerpt ?? row.excerpt;
    const current = parseExcerpts(row.excerpt, row.page_number);

    let passages = current.map(p => ({ text: p.text, page: p.printedPage }));
    let method = '';
    if (flagged && current.length === 1) {
      const proposal = proposePassages(index, oldExcerpt);
      if (proposal && proposal.passages.length >= 2 && proposal.passages.every(p => findStartPages(source, p.text).length > 0)
        && proposal.passages.reduce((n, p) => n + words(p.text), 0) < words(current[0].text)) {
        passages = proposal.passages;
        method = 'multi-passage';
        multi++;
      }
    }
    // Heading trim on every passage; keep the result only if it is still verbatim.
    passages = passages.map(p => {
      const tokens = p.text.split(/\s+/).map(display => ({ key: '', display, page: p.page }) as SourceToken);
      const text = trimHeadings(tokens).map(t => t.display).join(' ');
      const hits = findStartPages(source, text);
      if (text === p.text || hits.length === 0) return p;
      if (!method) method = 'heading-trimmed';
      return { text, page: hits.reduce((best, h) => Math.abs(h - p.page) < Math.abs(best - p.page) ? h : best, hits[0]) };
    });
    if (!method) return;
    if (method === 'heading-trimmed') trimmed++;

    row.excerpt = joinPassages(passages.map(p => p.text));
    row.page_number = passages.map(p => p.page).join('; ');
    const before = entry?.coverage ?? '1';
    const coverage = method === 'multi-passage' ? (proposePassages(index, oldExcerpt)?.coverage ?? 0) : Number(before);
    const updated: CsvRecord = {
      ...(entry ?? { row: String(rowNumber), question: row.question, old_page: row.page_number, old_excerpt: oldExcerpt, confidence: 'high' }),
      new_page: row.page_number,
      method: method === 'heading-trimmed' && entry ? entry.method : method,
      coverage: String(coverage),
      length_ratio: String(Number((passages.reduce((n, p) => n + words(p.text), 0) / Math.max(1, words(oldExcerpt))).toFixed(2))),
      needs_owner_review: row.needs_owner_review || 'no',
      new_excerpt: row.excerpt,
      coverage_before: before,
      previous_method: entry?.method ?? 'verbatim',
    };
    logByRow.set(rowNumber, updated);
  });

  console.log(`multi-passage: ${multi}; heading-trimmed only: ${trimmed}`);
  if (dryRun || multi + trimmed === 0) return;
  const rows = [...logByRow.values()].sort((a, b) => Number(a.row) - Number(b.row));
  fs.writeFileSync(LOG_PATH, formatCsv(LOG_HEADERS, rows, false), 'utf-8');
  writeCsvRecords(CSV_PATH, headers, records);
  console.log('Wrote data/wca-qa.csv and reports/qa-excerpt-repairs.csv');
}

main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });

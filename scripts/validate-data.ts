import fs from 'node:fs';
import path from 'node:path';
import { formatCsv, readCsvRecords } from './lib/csv';
import { loadSourceText } from './lib/source-text';
import {
  checkChunks, checkGlossary, checkItems, checkQaJsonSync, checkQaRows,
  type Failure, type QaCsvRow,
} from './lib/validate-checks';

const ROOT = process.cwd();
const REPORT = path.join(ROOT, 'reports', 'qa-validation.csv');
const HEADERS = ['dataset', 'id', 'check', 'page', 'suggestedPage', 'detail'];

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', name), 'utf-8')) as T;
}

export async function validateAll(): Promise<Failure[]> {
  const source = await loadSourceText();
  const { records } = readCsvRecords(path.join(ROOT, 'data', 'wca-qa.csv'));
  const chunks = readJson<Array<{ id: string; text: string; printedPage: number }>>('chunks.json');
  return [
    ...checkQaRows(source, records as unknown as QaCsvRow[]),
    ...checkQaJsonSync(records as unknown as QaCsvRow[], readJson('qa.json')),
    ...checkItems(source, readJson('items.json')),
    ...checkGlossary(source, readJson('glossary.json')),
    ...checkChunks(source, chunks),
  ];
}

async function main(): Promise<void> {
  const failures = await validateAll();
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, formatCsv(HEADERS, failures.map(f => ({ ...f, page: String(f.page), suggestedPage: String(f.suggestedPage) })), false), 'utf-8');

  const byCheck = new Map<string, number>();
  for (const f of failures) byCheck.set(`${f.dataset}/${f.check}`, (byCheck.get(`${f.dataset}/${f.check}`) ?? 0) + 1);
  if (failures.length === 0) {
    console.log('validate-data: all checks passed (report cleared).');
    return;
  }
  for (const [key, count] of byCheck) console.error(`  ${key}: ${count}`);
  console.error(`validate-data: ${failures.length} failure(s). See ${path.relative(ROOT, REPORT)}`);
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => { console.error('Fatal:', error); process.exitCode = 1; });
}

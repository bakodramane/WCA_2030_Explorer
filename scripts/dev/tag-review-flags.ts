// OD.2 one-off migration: copy the repair log's needs_owner_review flags into data/wca-qa.csv
// (columns needs_owner_review, approved_by). Idempotent; never overwrites an existing approval.
import path from 'node:path';
import { readCsvRecords, writeCsvRecords } from '../lib/csv';

const csvPath = path.join(process.cwd(), 'data', 'wca-qa.csv');
const { headers, records } = readCsvRecords(csvPath);
const { records: log } = readCsvRecords(path.join(process.cwd(), 'reports', 'qa-excerpt-repairs.csv'));
for (const column of ['needs_owner_review', 'approved_by']) if (!headers.includes(column)) headers.push(column);

const flagged = new Set<number>();
for (const entry of log) {
  const index = Number(entry.row) - 2;
  if (records[index]?.question !== entry.question) throw new Error(`Log row ${entry.row} does not match the CSV question`);
  if (entry.needs_owner_review === 'yes') flagged.add(index);
}
records.forEach((r, i) => {
  r.needs_owner_review ||= flagged.has(i) ? 'yes' : 'no';
  r.approved_by ??= '';
});
writeCsvRecords(csvPath, headers, records);
console.log(`Flagged ${records.filter(r => r.needs_owner_review === 'yes').length} of ${records.length} rows.`);

import fs from 'node:fs';

export type CsvRecord = Record<string, string>;

const BOM = '﻿';

/** RFC 4180 parser: quoted fields, doubled quotes, embedded commas and newlines. */
export function parseCsv(content: string): string[][] {
  const text = content.startsWith(BOM) ? content.slice(1) : content;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function readCsvRecords(file: string): { headers: string[]; records: CsvRecord[] } {
  const [headers, ...rows] = parseCsv(fs.readFileSync(file, 'utf-8'));
  if (!headers || rows.length === 0) throw new Error(`CSV has no data rows: ${file}`);
  const records = rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
  return { headers, records };
}

function encodeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Minimal-quoting writer (matches the committed wca-qa.csv layout: BOM + LF). */
export function formatCsv(headers: string[], records: CsvRecord[], bom = true): string {
  const lines = [headers, ...records.map(r => headers.map(h => r[h] ?? ''))]
    .map(cells => cells.map(encodeField).join(','));
  return `${bom ? BOM : ''}${lines.join('\n')}\n`;
}

export function writeCsvRecords(file: string, headers: string[], records: CsvRecord[], bom = true): void {
  fs.writeFileSync(file, formatCsv(headers, records, bom), 'utf-8');
}

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatCsv, parseCsv, readCsvRecords } from '../scripts/lib/csv';

describe('csv helpers', () => {
  it('parses quoted commas, doubled quotes, and embedded newlines', () => {
    const rows = parseCsv('a,b\n"x, y","say ""hi"""\n"two\nlines",z\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"'], ['two\nlines', 'z']]);
  });

  it('round-trips data/wca-qa.csv byte for byte', () => {
    const file = path.join(process.cwd(), 'data', 'wca-qa.csv');
    const { headers, records } = readCsvRecords(file);
    expect(formatCsv(headers, records)).toBe(fs.readFileSync(file, 'utf-8'));
  });
});

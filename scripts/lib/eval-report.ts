import type { ItemResult } from './eval-engine';

export const pct = (n: number, d: number): string => d === 0 ? 'n/a' : `${(100 * n / d).toFixed(1)} %`;

export function table(headers: string[], rows: Array<Array<string | number>>): string {
  const line = (cells: Array<string | number>): string => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export interface Summary {
  n: number;
  answered: number;
  recall1: number;
  recall5: number;
  citation: number;
  tiers: Record<string, number>;
}

export function summarise(results: ItemResult[]): Summary {
  const tiers: Record<string, number> = {};
  for (const r of results) tiers[r.tier] = (tiers[r.tier] ?? 0) + 1;
  return {
    n: results.length,
    answered: results.filter(r => r.answered).length,
    recall1: results.filter(r => r.top1).length,
    recall5: results.filter(r => r.top5).length,
    citation: results.filter(r => r.topCitation).length,
    tiers,
  };
}

export function summaryRow(label: string, s: Summary): Array<string | number> {
  return [label, s.n, pct(s.answered, s.n), pct(s.recall1, s.n), pct(s.recall5, s.n), pct(s.citation, s.answered)];
}

export const SUMMARY_HEADERS = ['', 'n', 'answered', 'recall@1', 'recall@5', 'top citation correct (of answered)'];

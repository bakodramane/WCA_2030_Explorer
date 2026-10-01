// D4: text colours keep at least 4.5:1 contrast on the backgrounds they sit on.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.join(process.cwd(), 'src', 'ui', 'styles.css'), 'utf-8');
const token = (name: string): string => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1];

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('D4 — colour contrast', () => {
  it('--muted meets 4.5:1 on the page background, the card surface, and the trust-strip tint', () => {
    expect(ratio(token('muted'), token('bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('muted'), token('surface'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('muted'), '#ece9e0')).toBeGreaterThanOrEqual(4.5);
  });

  it('ink, accent, and the warning text meet 4.5:1 on their backgrounds', () => {
    expect(ratio(token('ink'), token('bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('accent'), token('bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(token('warn'), token('warn-bg'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio('#166534', token('bg'))).toBeGreaterThanOrEqual(4.5);
  });
});

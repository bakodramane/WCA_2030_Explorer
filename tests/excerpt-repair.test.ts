import { describe, expect, it } from 'vitest';
import { buildSourceIndex, repairExcerpt, wordKey } from '../scripts/lib/excerpt-repair';
import { buildSourceText, findStartPages } from '../scripts/lib/source-text';

const PARA_A = 'The holder is the person who makes the major decisions regarding resource use and exercises management control over the agricultural holding operation. ';
const PARA_B = 'A household is a group of persons who share arrangements for food and other essentials for living. ';
const FILLER = 'Statistical offices compile tables of structural data on land use crops livestock and labour for national planning purposes every ten years. ';

const source = buildSourceText(new Map([
  [10, `7.1.3 ${PARA_A}${FILLER}${FILLER.replace('land', 'soil')}`],
  [11, `7.1.4 ${PARA_B} \u008b Land under crops; \u008b Land fallow; \u008b Pasture and meadows. ${FILLER.replace('crops', 'trees')}`],
]));
const index = buildSourceIndex(source);

describe('B4 excerpt repair', () => {
  it('normalises word keys', () => {
    expect(wordKey('“Holder,”')).toBe('holder');
  });

  it('restores page furniture and bullet glyphs by quoting the source', () => {
    const old = 'A household is a group of persons who share arrangements for food and other essentials for living. 12 WORLD PROGRAMME FOR THE CENSUS Land under crops; Land fallow; Pasture and meadows.';
    const repair = repairExcerpt(index, old)!;
    expect(repair.page).toBe(11);
    expect(findStartPages(source, repair.text)).toEqual([11]);
    expect(repair.text).toContain('• Land under crops;');
    expect(repair.confidence).toBe('high');
  });

  it('replaces a paraphrased ending with the verbatim sentence and reports lower coverage', () => {
    const old = 'The holder is the person who makes the major decisions regarding resource use and exercises management control over the agricultural holding operation, meaning someone legally liable.';
    const repair = repairExcerpt(index, old)!;
    expect(repair.text.startsWith('7.1.3 The holder is the person')).toBe(true);
    expect(repair.text.endsWith('operation.')).toBe(true);
    expect(repair.coverage).toBeLessThan(1);
    expect(findStartPages(source, repair.text)).toEqual([10]);
  });

  it('joins sentences stitched from nearby passages into one contiguous quote', () => {
    const old = 'The holder is the person who makes the major decisions regarding resource use and exercises management control over the agricultural holding operation. Statistical offices compile tables of structural data on soil use crops livestock and labour for national planning purposes every ten years.';
    const repair = repairExcerpt(index, old)!;
    expect(repair.text).toContain('operation.');
    expect(repair.text).toContain('soil use crops livestock');
    expect(findStartPages(source, repair.text)).toEqual([10]);
  });

  it('returns null when nothing in the source matches', () => {
    expect(repairExcerpt(index, 'Quantum entanglement of photons in fibre optic cables is unrelated to farming.')).toBeNull();
  });
});

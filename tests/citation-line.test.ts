import { describe, expect, it } from 'vitest';
import { citationLine, displayTitle, matchBand, pdfLinkHtml, pdfPageUrl, qaBand } from '../src/ui/citation';
import { SOURCE_PDF_FILE } from '../src/engine/source-pdf';

describe('D2 — citation line and match band', () => {
  it('writes one line: §paragraph · section · page', () => {
    expect(citationLine({ paragraphs: ['7.2.13'], sectionTitle: 'Theme 2: Land', printedPage: 81, printedPageEnd: 81 })).toBe('§7.2.13 · Theme 2: Land · p. 81');
    expect(citationLine({ paragraphs: [], sectionTitle: 'Theme 2: Land', printedPage: 81, printedPageEnd: 82 })).toBe('Theme 2: Land · pp. 81–82');
  });

  it('turns outline titles into sentence case, keeping acronyms, proper names, and the word after a colon', () => {
    expect(displayTitle('Complementary Tools to Data Collection (georeferencing, GIS, EO)')).toBe('Complementary tools to data collection');
    expect(displayTitle('Theme 2: Land (total area, land use classification, land tenure)')).toBe('Theme 2: Land');
    expect(displayTitle('Annex 4 · Theme 5: Livestock')).toBe('Annex 4 · Theme 5: Livestock');
    expect(displayTitle('Using census data for Small Area Estimation')).toBe('Using census data for Small Area Estimation');
    expect(displayTitle('The Cape Town Global Action Plan for Sustainable Development Data')).toBe('The Cape Town Global Action Plan for sustainable development data');
    expect(displayTitle('Data Conflicts and ISIC Scope')).toBe('Data conflicts and ISIC scope');
  });

  it('bands: strong at threshold + 0.15, good below, keyword partial; raw score only in the tooltip', () => {
    expect(matchBand({ rawScore: 0.67, matchType: 'semantic' }, 0.52).label).toBe('Strong match');
    expect(matchBand({ rawScore: 0.66, matchType: 'semantic' }, 0.52).label).toBe('Good match');
    const lexical = matchBand({ rawScore: 12.4, matchType: 'lexical' });
    expect(lexical.label).toBe('Partial match (keyword)');
    expect(lexical.tooltip).toContain('12.4');
    expect(matchBand({ rawScore: 0.6123, matchType: 'semantic' }, 0.52).tooltip).toContain('0.612');
    expect(qaBand(0.95).label).toBe('Strong match');
    expect(qaBand(0.82).label).toBe('Good match');
  });

  it('D3: links to the bundled PDF at the PDF page (printed + 14), same origin', () => {
    expect(pdfPageUrl(54)).toBe(pdfPageUrl(54).replace(/[^/]*$/, '') + `${SOURCE_PDF_FILE}#page=54`);
    expect(pdfPageUrl(54).startsWith('http')).toBe(false);
    const html = pdfLinkHtml(54);
    expect(html).toContain('View page in PDF');
    expect(html).toContain('rel="noopener"');
    expect(html).toContain('View page 40 in the official PDF');
  });
});

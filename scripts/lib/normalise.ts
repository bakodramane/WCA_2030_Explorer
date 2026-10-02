/** Normalise text for verbatim comparison: whitespace, quotes, dashes, bullets, ligatures. */
export function normaliseForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, '')
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'")
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    // The PDF font maps bullets to C1 control characters (U+008B) or private-use glyphs.
    .replace(/[\u0080-\u009f\ue000-\uf8ff\u25cf\u25aa\u25e6\u2022]/g, '\u2022')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whitespace-free key, tolerant of extractor spacing around hyphens and line breaks. */
export function compactKey(text: string): string {
  return normaliseForMatch(text).replace(/\s+/g, '');
}

/** Display form: original typography kept; bullet glyphs and whitespace tidied. */
export function displayText(text: string): string {
  return text
    .replace(/[\u0080-\u009f\ue000-\uf8ff]/g, '\u2022')
    .replace(/\s+/g, ' ')
    .trim();
}

const SYNONYM_MAP: Record<string, string> = {
  'modalit':  'approach method enumeration sample register modular',
  'modality': 'approach method enumeration sample register modular',
};

export function expandQuery(query: string): string {
  const lower = query.toLowerCase();
  const expansions: string[] = [];
  for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
    if (lower.includes(key)) {
      expansions.push(synonyms);
    }
  }
  return expansions.length === 0 ? query : `${query} ${expansions.join(' ')}`;
}

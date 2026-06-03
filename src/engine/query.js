const SYNONYM_MAP = {
    'modalit': 'approach method enumeration sample register modular',
    'modality': 'approach method enumeration sample register modular',
};
export function expandQuery(query) {
    const lower = query.toLowerCase();
    const expansions = [];
    for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
        if (lower.includes(key)) {
            expansions.push(synonyms);
        }
    }
    return expansions.length === 0 ? query : `${query} ${expansions.join(' ')}`;
}

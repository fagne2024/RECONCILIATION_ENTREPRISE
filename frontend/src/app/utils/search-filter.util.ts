/** Découpe une recherche « A, B, C » en termes normalisés (minuscules, sans espaces superflus). */
export function parseCommaSeparatedSearchTerms(filter: string): string[] {
    if (!filter?.trim()) {
        return [];
    }
    return filter
        .split(',')
        .map(term => term.trim().toLowerCase())
        .filter(Boolean);
}

/** Indique si le champ de recherche contient au moins un terme actif. */
export function hasCommaSeparatedSearchFilter(filter: string): boolean {
    return parseCommaSeparatedSearchTerms(filter).length > 0;
}

/**
 * Filtre OR : l'élément correspond s'il contient au moins un des termes
 * dans l'une des valeurs searchable (code, libellé, nombre de lignes, etc.).
 */
export function matchesCommaSeparatedFilter(filter: string, ...searchableValues: (string | number)[]): boolean {
    const terms = parseCommaSeparatedSearchTerms(filter);
    if (!terms.length) {
        return true;
    }
    const normalized = searchableValues.map(v => String(v ?? '').toLowerCase());
    return terms.some(term => normalized.some(val => val.includes(term)));
}

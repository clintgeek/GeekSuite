const HIGHLIGHT_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'are', 'was']);

/**
 * The words of a query worth marking. The gateway's `$text` search matches
 * any of the words, so marking only the whole phrase left a multi-word search
 * ("fix the garage") with no marks at all. Words of 3+ letters, minus a few
 * stop words; a query with none of those (e.g. "go") is marked as typed.
 */
export function highlightTerms(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const words = [...new Set(q.toLowerCase().split(/\s+/))]
        .filter((w) => w.length >= 3 && !HIGHLIGHT_STOPWORDS.has(w));
    return words.length ? words : [q.toLowerCase()];
}

/**
 * One case-insensitive pattern for `terms`, longest first (so "garages" wins
 * over "garage" where both are terms). What a search row marks, and where a
 * search hit is looked for on a handwritten page (utils/sketchFind.js).
 */
export function termRegExp(terms) {
    if (!terms?.length) return null;
    const pattern = [...terms]
        .sort((a, b) => b.length - a.length)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    return new RegExp(`(${pattern})`, 'gi');
}

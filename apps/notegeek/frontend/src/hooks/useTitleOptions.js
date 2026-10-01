import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { NOTE_TITLES } from '../graphql/queries';
import { linkKey } from '../utils/wikiLinks';

export const PICKER_LIMIT = 6;
export const PICKER_LISTBOX_ID = 'ng-wikilink-picker';
export const pickerOptionId = (i) => `${ PICKER_LISTBOX_ID }-opt-${ i }`;

/**
 * The titles the [[ picker offers for `query` (typed after `[[`): the
 * gateway's `noteTitles` (prefix matches first, no bodies), debounced while
 * typing, plus — when nothing is called exactly that — a last row that links
 * to a note that doesn't exist yet (`[[query]]`, which the gateway resolves
 * once the note appears).
 *
 * The rows are ALWAYS narrowed to what is typed right now, client-side, on
 * top of the server's answer: the request lags the keyboard by the debounce,
 * and Enter pressed inside that window used to choose from the list for the
 * PREVIOUS query (typing `[[garage` + Enter fast linked "Q3 roadmap notes" —
 * found by harness scene 18b). A stale list now only ever offers rows that
 * still match.
 */
export function useTitleOptions(query, open, { excludeId = null } = {}) {
    const [debounced, setDebounced] = useState(query);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(query), 120);
        return () => clearTimeout(t);
    }, [query]);
    const { data, previousData } = useQuery(NOTE_TITLES, {
        variables: { q: debounced || null, limit: PICKER_LIMIT + 1 },
        skip: !open,
        fetchPolicy: 'cache-first',
        errorPolicy: 'all',
    });
    const answer = data || previousData;
    return useMemo(() => {
        if (!open) return [];
        const q = String(query || '').trim();
        const low = q.toLowerCase();
        const rows = (answer?.noteTitles || [])
            .filter((n) => n.id !== excludeId && n.title && (!low || n.title.toLowerCase().includes(low)))
            .map((n, i) => ({ n, i }))
            .sort((a, b) => (Number(!a.n.title.toLowerCase().startsWith(low)) - Number(!b.n.title.toLowerCase().startsWith(low))) || a.i - b.i)
            .map(({ n }) => n)
            .slice(0, PICKER_LIMIT);
        const exact = rows.some((n) => linkKey(n.title) === linkKey(q));
        return q && !exact ? [...rows, { id: null, title: q, isNew: true }] : rows;
    }, [answer, open, query, excludeId]);
}

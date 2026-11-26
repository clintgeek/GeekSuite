import { useEffect, useState } from 'react';
import { SKETCH_TRANSCRIPT, SKETCH_TRANSCRIPT_FIND } from '../../graphql/queries';
import { highlightTerms, termRegExp } from '../../utils/highlightTerms';

/**
 * Which stored text to place a search hit with (DOCS/HANDWRITING.md §5).
 * The current transcript first; else the last machine reading, then the
 * user's older corrections (a reading is usually newer than corrections made
 * against an earlier one). Whichever of them holds the query's words wins.
 * `stale`: the text is of an older version of the page.
 */
export function pickFindText(view, query) {
    if (!view) return { text: null, stale: false };
    const candidates = [
        view.current && view.text ? { text: view.text, stale: false } : null,
        view.lastReading ? { text: view.lastReading, stale: !view.current } : null,
        view.lastEdit ? { text: view.lastEdit, stale: !view.current } : null,
    ].filter((c) => c && typeof c.text === 'string' && c.text.trim());
    const re = termRegExp(highlightTerms(query));
    const holding = re ? candidates.find((c) => { re.lastIndex = 0; return re.test(c.text); }) : null;
    return holding || candidates[0] || { text: null, stale: false };
}

/**
 * A search hit opened a handwritten note (`/notes/:id?find=<q>`): fetch the
 * text to place it with. Its own query, so the note itself is never waiting
 * on it. An older gateway rejects the new fields: then the existing
 * `sketchTranscript.text`, then nothing (the note opens as usual). Never a
 * toast: the operation is marked `newFields` (no stale-bundle reload) and
 * errors are swallowed here.
 *
 * Returns null without a query; else `{ query, loading, text, stale }`.
 */
export default function useSketchFind({ apollo, noteId, query }) {
    const [state, setState] = useState(null);
    useEffect(() => {
        if (!apollo || !noteId || !query) {
            setState(null);
            return undefined;
        }
        let live = true;
        setState({ query, loading: true, text: null, stale: false });
        (async () => {
            let view = null;
            try {
                const { data } = await apollo.query({
                    query: SKETCH_TRANSCRIPT_FIND,
                    variables: { noteId },
                    fetchPolicy: 'no-cache',
                    context: { newFields: true },
                });
                view = data?.sketchTranscript || null;
            } catch {
                try {
                    const { data } = await apollo.query({ query: SKETCH_TRANSCRIPT, variables: { noteId }, fetchPolicy: 'no-cache' });
                    view = data?.sketchTranscript || null;
                } catch {
                    view = null;
                }
            }
            if (live) setState({ query, loading: false, ...pickFindText(view, query) });
        })();
        return () => { live = false; };
    }, [apollo, noteId, query]);
    return state;
}

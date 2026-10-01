import React from 'react';
import { useQuery } from '@apollo/client';
import { RELATED_NOTES } from '../../graphql/queries';
import NoteSection from './NoteSection';

export const RELATED_LIMIT = 5;

/**
 * "Related notes" at the foot of a note: the notes nearest it in meaning,
 * from the gateway's LOCAL embeddings (DOCS/CONTEXT.md §11 — note text never
 * leaves the box).
 *
 * Never in the way: nothing renders while it loads, when it fails (an older
 * gateway, the embeddings being down), or when there is nothing to show —
 * a note is only indexed ~30 s after its last edit, so a brand-new note has
 * no neighbours yet. It is its own query, so it never delays the note.
 */
function RelatedNotes({ noteId }) {
    const { data, error } = useQuery(RELATED_NOTES, {
        variables: { noteId, limit: RELATED_LIMIT },
        skip: !noteId,
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all',
    });
    if (!noteId || error) return null;
    const items = (data?.relatedNotes || []).filter((n) => n.id !== noteId);
    return (
        <NoteSection
            title="Related notes"
            hint="similar in meaning"
            items={items}
            dataAttr="related-notes"
        />
    );
}

export default RelatedNotes;

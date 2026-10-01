import React from 'react';
import { useQuery } from '@apollo/client';
// Deep-import (see RichTextEditor.jsx for why).
import LinkIcon from '@mui/icons-material/Link';
import { BACKLINKS } from '../../graphql/queries';
import { findWikiLinks } from '../../utils/wikiLinks';
import NoteSection from './NoteSection';

/**
 * The words around the link, with the [[link]] itself in the weight of a
 * link — so the row says how the other note mentions this one.
 */
function SnippetWithLink({ snippet }) {
    const parts = [];
    let at = 0;
    for (const l of findWikiLinks(snippet)) {
        if (l.start > at) parts.push(snippet.slice(at, l.start));
        parts.push(<strong key={l.start} style={{ fontWeight: 600 }}>{l.label}</strong>);
        at = l.end;
    }
    parts.push(snippet.slice(at));
    return <>{parts}</>;
}

/**
 * "Linked from" at the foot of a note: the notes that link here with
 * [[this title]] (or an in-app link), newest first (DOCS/CONTEXT.md §12).
 * Explicit connections, so it sits ABOVE "Related notes" and reads
 * differently: a link glyph, no hint, the linking sentence as the row's text.
 * Hidden while loading, on error, and when nothing links here.
 */
function LinkedFrom({ noteId }) {
    const { data, error } = useQuery(BACKLINKS, {
        variables: { noteId },
        skip: !noteId,
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all',
    });
    if (!noteId || error) return null;
    const items = (data?.backlinks || []).filter((n) => n.id !== noteId);
    return (
        <NoteSection
            title="Linked from"
            icon={<LinkIcon aria-hidden sx={{ fontSize: 15, color: 'text.secondary', alignSelf: 'center' }} />}
            items={items}
            renderSnippet={(item) => <SnippetWithLink snippet={item.snippet} />}
            dataAttr="linked-from"
        />
    );
}

export default LinkedFrom;

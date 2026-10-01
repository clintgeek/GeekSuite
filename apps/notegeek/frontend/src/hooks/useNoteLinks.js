import { createContext, useContext, useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import remarkGfm from 'remark-gfm';
import { NOTE_LINKS } from '../graphql/queries';
import { linkMap } from '../utils/wikiLinks';
import remarkInlineTags from '../utils/remarkInlineTags';
import remarkWikiLinks from '../utils/remarkWikiLinks';

/**
 * How the note on screen resolves its [[links]]: `key → noteId | null`.
 * Provided by the viewer and the editor page; read by every markdown renderer
 * under them (`useMarkdownPlugins`). Default: nothing resolves, so a
 * renderer outside a note (Compose) still shows `[[x]]` as a "create" link.
 */
export const WikiLinkContext = createContext(() => null);

/**
 * The note's resolved links, from the gateway (NoteLinks). `refreshToken`
 * refetches — the editor bumps it after each save, since links resolve on
 * save. Failure (an older gateway) just means nothing resolves.
 */
export function useNoteLinks(noteId, refreshToken = 0) {
    const { data, refetch } = useQuery(NOTE_LINKS, {
        variables: { id: noteId },
        skip: !noteId,
        fetchPolicy: 'cache-and-network',
        errorPolicy: 'all',
    });
    useEffect(() => {
        // Defensive on purpose: resolving links is a nicety and must never be
        // able to take the editor down.
        if (!noteId || !refreshToken || typeof refetch !== 'function') return;
        Promise.resolve().then(() => refetch()).catch(() => {});
    }, [noteId, refreshToken, refetch]);
    const links = data?.note?.links;
    return useMemo(() => {
        const map = linkMap(links);
        return (key) => map.get(key) || null;
    }, [links]);
}

/** The remark plugins for rendered note markdown, resolving [[links]] with `resolve`. */
export const markdownPluginsFor = (resolve) => [remarkGfm, remarkInlineTags, [remarkWikiLinks, { resolve }]];

/** The same, with the resolver of the note on screen (WikiLinkContext). */
export function useMarkdownPlugins() {
    const resolve = useContext(WikiLinkContext);
    return useMemo(() => markdownPluginsFor(resolve), [resolve]);
}

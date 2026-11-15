import React, { useContext, useEffect, useState } from 'react';
import { alpha } from '@mui/material/styles';
import {
    Typography,
    Box,
    ButtonBase,
    Skeleton,
    Divider,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import { GeekEmptyState, GeekErrorState, GeekSheet } from '@geeksuite/ui';
import { getApolloContext, useQuery } from '@apollo/client';
import { GET_NOTES_PAGE } from '../graphql/queries';
import NoteRow from './notes/NoteRow';
import { graphiteTokens, layout, tapTarget44 } from '../theme/tokens';
import { NOTE_TYPE_ORDER, noteTypeMeta } from './notes/noteTypeMeta';
import { TagsPanel } from './Sidebar';
import { groupByRecency } from '../utils/recency';
import { useNoteSelection, rowSelectProps } from '../hooks/useNoteSelection';
import { SelectButton, SelectingHeader } from './select/SelectControl';
import SelectionBar from './select/SelectionBar';

// One page of the list. Keyset paging (5.2): "Show more" asks for the next
// page after the last note shown, so notes past the newest 200 are reachable.
export const NOTE_PAGE_SIZE = 100;

// Type filters: "All" and every type, as short plural labels with the
// type's glyph. One quiet row; the active one is highlighted.
const TYPE_FILTERS = [null, ...NOTE_TYPE_ORDER];
const FILTER_LABELS = {
    markdown: 'Notes',
    handwritten: 'Sketches',
    code: 'Code',
    mindmap: 'Mind maps',
    text: 'Rich text',
};

function FilterChip({ type, active, onClick }) {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const Icon = type ? noteTypeMeta(type).Icon : null;
    return (
        <ButtonBase
            onClick={onClick}
            aria-pressed={active}
            data-type-filter={type || 'all'}
            sx={{
                flexShrink: 0,
                borderRadius: '999px',
                [theme.breakpoints.down('md')]: { ...tapTarget44 },
                '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
                '&:hover .ng-chip': { bgcolor: active ? g.hl : alpha(g.ink, 0.05) },
            }}
        >
            <Box
                component="span"
                className="ng-chip"
                sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    height: 30,
                    px: '12px',
                    borderRadius: '999px',
                    border: `1px solid ${active ? g.ink : 'transparent'}`,
                    bgcolor: active ? g.hl : 'transparent',
                    color: active ? g.onHl : 'text.secondary',
                    fontSize: '0.8125rem',
                    fontWeight: active ? 600 : 500,
                    whiteSpace: 'nowrap',
                }}
            >
                {Icon && <Icon aria-hidden sx={{ fontSize: 16 }} />}
                {type ? FILTER_LABELS[type] : 'All'}
            </Box>
        </ButtonBase>
    );
}

// Sort options
const SORT_OPTIONS = [
    { value: 'updated', label: 'Recent' },
    { value: 'created', label: 'Created' },
    { value: 'title',   label: 'A-Z' },
];

// The server's own sort names (gateway `notes(sort:)`). Sorting on the server
// means A–Z is A–Z of every note, not of the 200 newest (5.2).
const SERVER_SORT = {
    updated: 'updatedAt_desc',
    created: 'createdAt_desc',
    title: 'title_asc',
};

/**
 * A recency heading: a sentence-case label, a hairline, and the bucket's count.
 * An <h3> so the list has a real outline for screen-reader navigation.
 */
function GroupHeading({ label, count }) {
    const theme = useTheme();
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                px: '8px',
                pt: '20px',
                pb: '4px',
            }}
        >
            <Typography
                component="h3"
                variant="h6"
                sx={{ color: 'text.secondary', m: 0, whiteSpace: 'nowrap' }}
            >
                {label}
            </Typography>
            <Box aria-hidden sx={{ flex: 1, height: '1px', bgcolor: theme.palette.divider }} />
            <Typography component="span" variant="caption" sx={{ color: 'text.secondary' }}>
                {count}
            </Typography>
        </Box>
    );
}

function RowList({ notes, dateField, tagContext, selection }) {
    const theme = useTheme();
    return notes.map((note, idx) => (
        <React.Fragment key={note.id || note._id}>
            {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
            <NoteRow note={note} dateField={dateField} tagContext={tagContext} {...rowSelectProps(selection, note)} />
        </React.Fragment>
    ));
}

// ─── NoteList ─────────────────────────────────────────────────────────────────

/**
 * `under` is the nested-tag view (TagNotesList): the tag and everything
 * beneath it, with each row naming the sub-tag it sits in. `tag` / `prefix`
 * are the older exact / raw-prefix filters, kept for any caller that wants them.
 */
function NoteList({ tag, prefix, under }) {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const isPhone = useMediaQuery(theme.breakpoints.down('md'));
    const [tagsOpen, setTagsOpen] = useState(false);
    const [typeFilter, setTypeFilter] = useState(null);
    const [sortBy, setSortBy] = useState('updated');
    // Select mode (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U1): a different
    // tag's list is a different page, so the selection does not carry over.
    const selection = useNoteSelection({ resetKey: `${tag || ''}|${prefix || ''}|${under || ''}` });

    const variables = { tag, prefix, under, type: typeFilter, sort: SERVER_SORT[sortBy], first: NOTE_PAGE_SIZE };
    const { loading: isLoadingList, error, data, refetch } = useQuery(GET_NOTES_PAGE, {
        variables,
        fetchPolicy: 'cache-and-network',
    });

    // Pages after the first, fetched on "Show more". Kept here rather than
    // merged into the cached first page, so the cache's `notesPage` entries
    // stay exactly what each query asked for (and evict as before).
    const apollo = useContext(getApolloContext())?.client || null;
    const [more, setMore] = useState({ key: null, notes: [], cursor: null, hasMore: false, loading: false, error: null });
    const listKey = JSON.stringify(variables);
    const firstPage = data?.notesPage;
    // A new filter, sort or a refreshed first page starts paging over.
    useEffect(() => {
        setMore({ key: listKey, notes: [], cursor: null, hasMore: false, loading: false, error: null });
    }, [listKey, firstPage]);

    const paged = more.key === listKey && more.notes.length > 0;
    const notes = React.useMemo(() => {
        const first = firstPage?.notes || [];
        if (!paged) return first;
        const seen = new Set(first.map((n) => n.id));
        return [...first, ...more.notes.filter((n) => !seen.has(n.id))];
    }, [firstPage, more, paged]);
    const nextCursor = paged ? more.cursor : firstPage?.nextCursor;
    const hasMore = Boolean(apollo) && Boolean(nextCursor) && (paged ? more.hasMore : Boolean(firstPage?.hasMore));

    const loadMore = async () => {
        if (!apollo || more.loading || !nextCursor) return;
        setMore((m) => ({ ...m, key: listKey, loading: true, error: null }));
        try {
            const { data: page } = await apollo.query({
                query: GET_NOTES_PAGE,
                variables: { ...variables, after: nextCursor },
                fetchPolicy: 'network-only',
            });
            const got = page?.notesPage;
            setMore((m) => (m.key !== listKey ? m : {
                ...m,
                notes: [...m.notes, ...(got?.notes || [])],
                cursor: got?.nextCursor || null,
                hasMore: Boolean(got?.hasMore),
                loading: false,
            }));
        } catch (err) {
            setMore((m) => ({ ...m, loading: false, error: err?.message || 'Could not load more notes.' }));
        }
    };

    // The server sorts — titles case-insensitively — so the list shows
    // exactly what came back, in that order (5.2).
    const sortedNotes = notes;

    // Pinned notes get their own group ABOVE everything else — the server
    // already sorts them first, so this is a client-side split, not a
    // resort. They are pulled out here so neither the date groups nor the
    // A–Z flat list repeat them below.
    const pinnedNotes = React.useMemo(() => sortedNotes.filter((n) => n.pinned), [sortedNotes]);
    const unpinnedNotes = React.useMemo(() => sortedNotes.filter((n) => !n.pinned), [sortedNotes]);

    // Recency groups apply to the two date sorts only; A–Z is one run.
    const dateField = sortBy === 'created' ? 'createdAt' : 'updatedAt';
    const groups = React.useMemo(
        () => (sortBy === 'title' ? null : groupByRecency(unpinnedNotes, { field: dateField })),
        [unpinnedNotes, sortBy, dateField]
    );

    if (isLoadingList && !data) {
        return (
            <Box sx={{ py: 2, maxWidth: layout.contentWidth, mx: 'auto' }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} height={layout.rowHeight} sx={{ borderRadius: 1, mb: 0.5 }} variant="rounded" />
                ))}
            </Box>
        );
    }

    if (error) {
        return (
            <GeekErrorState
                sx={{ maxWidth: layout.contentWidth, mx: 'auto' }}
                error={error}
                onRetry={() => refetch()}
            />
        );
    }

    return (
        <Box sx={{ py: { xs: '8px', sm: '16px' }, px: { xs: '8px', sm: 0 }, maxWidth: layout.contentWidth, mx: 'auto' }}>
            {/* ── Count, tags (phone), sort — or "N selected · Cancel" ── */}
            {selection.active ? <SelectingHeader selection={selection} /> : (
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                mb: '4px',
                px: '4px',
            }}>
                <Typography variant="h6" component="h2" sx={{ color: 'text.secondary', m: 0, mr: 'auto' }}>
                    {notes.length}{hasMore ? '+' : ''} {notes.length === 1 && !hasMore ? 'note' : 'notes'}
                </Typography>

                {notes.length > 0 && <SelectButton selection={selection} />}

                {isPhone && (
                    <ButtonBase
                        onClick={() => setTagsOpen(true)}
                        aria-haspopup="dialog"
                        sx={{
                            ...tapTarget44,
                            gap: '6px',
                            px: '8px',
                            borderRadius: '8px',
                            fontSize: '0.8125rem',
                            fontWeight: 500,
                            color: 'text.secondary',
                            '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
                        }}
                    >
                        <LocalOfferOutlined aria-hidden sx={{ fontSize: 16 }} />
                        Tags
                    </ButtonBase>
                )}

                <Box role="group" aria-label="Sort" sx={{ display: 'flex' }}>
                    {SORT_OPTIONS.map((opt) => {
                        const on = sortBy === opt.value;
                        return (
                            <ButtonBase
                                key={opt.value}
                                onClick={() => setSortBy(opt.value)}
                                aria-pressed={on}
                                sx={{
                                    ...tapTarget44,
                                    px: '8px',
                                    borderRadius: '8px',
                                    fontSize: '0.8125rem',
                                    fontWeight: on ? 600 : 400,
                                    color: on ? 'text.primary' : 'text.secondary',
                                    textDecoration: on ? 'underline' : 'none',
                                    textDecorationColor: g.ink,
                                    textDecorationThickness: '2px',
                                    textUnderlineOffset: '6px',
                                    '&:hover': { color: 'text.primary' },
                                    '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: -2 },
                                }}
                            >
                                {opt.label}
                            </ButtonBase>
                        );
                    })}
                </Box>
            </Box>
            )}

            {/* Type filter — one quiet row, scrolls sideways on a phone */}
            <Box
                role="group"
                aria-label="Filter by type"
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    mb: '4px',
                    px: '2px',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    '&::-webkit-scrollbar': { display: 'none' },
                }}
            >
                {TYPE_FILTERS.map((type) => {
                    const isActive = typeFilter === type;
                    return (
                        <FilterChip
                            key={type || 'all'}
                            type={type}
                            active={isActive}
                            onClick={() => setTypeFilter(type && isActive ? null : type)}
                        />
                    );
                })}
            </Box>

            {isPhone && (
                <GeekSheet open={tagsOpen} onClose={() => setTagsOpen(false)} title="Tags" snap="full">
                    <TagsPanel onNavigate={() => setTagsOpen(false)} />
                </GeekSheet>
            )}

            {/* The list — pinned first (its own group, never repeated below),
                then grouped by recency for date sorts, or flat for A–Z. */}
            {sortedNotes.length === 0 ? (
                <GeekEmptyState
                    title={(tag || under) ? 'No notes tagged here yet.' : 'No notes yet'}
                    description={!(tag || under) ? 'Create your first note to get started' : undefined}
                />
            ) : (
                <>
                    {pinnedNotes.length > 0 && (
                        <Box component="section" aria-label="Pinned">
                            <GroupHeading label="Pinned" count={pinnedNotes.length} />
                            <RowList notes={pinnedNotes} dateField={dateField} tagContext={under} selection={selection} />
                        </Box>
                    )}
                    {groups ? (
                        groups.map((group) => (
                            <Box component="section" key={group.key} aria-label={group.label}>
                                <GroupHeading label={group.label} count={group.notes.length} />
                                <RowList notes={group.notes} dateField={dateField} tagContext={under} selection={selection} />
                            </Box>
                        ))
                    ) : unpinnedNotes.length > 0 ? (
                        <Box sx={{ pt: '8px' }}>
                            <RowList notes={unpinnedNotes} dateField={dateField} tagContext={under} selection={selection} />
                        </Box>
                    ) : null}
                </>
            )}

            {hasMore || more.error ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', py: '16px' }}>
                    {more.error ? (
                        <Typography variant="body2" sx={{ color: 'error.main' }}>{more.error}</Typography>
                    ) : null}
                    <ButtonBase
                        onClick={loadMore}
                        disabled={more.loading}
                        data-load-more=""
                        sx={{
                            ...tapTarget44,
                            px: '16px',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: 'text.primary',
                            border: `1px solid ${g.border}`,
                            '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: 2 },
                        }}
                    >
                        {more.loading ? 'Loading…' : more.error ? 'Try again' : 'Show more notes'}
                    </ButtonBase>
                </Box>
            ) : null}

            <SelectionBar selection={selection} />
        </Box>
    );
}

export default NoteList;

import React, { useState } from 'react';
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
import { gql, useQuery } from '@apollo/client';
import NoteRow from './notes/NoteRow';
import { graphiteTokens, layout, tapTarget44 } from '../theme/tokens';
import { NOTE_TYPE_ORDER, noteTypeMeta } from './notes/noteTypeMeta';
import { TagsPanel } from './Sidebar';
import { groupByRecency } from '../utils/recency';

const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String, $type: String, $limit: Int) {
        notes(tag: $tag, prefix: $prefix, type: $type, limit: $limit) {
            id
            title
            content
            type
            tags
            createdAt
            updatedAt
        }
    }
`;

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

function RowList({ notes, dateField }) {
    const theme = useTheme();
    return notes.map((note, idx) => (
        <React.Fragment key={note.id || note._id}>
            {idx > 0 && <Divider sx={{ borderColor: theme.palette.divider, mx: '8px' }} />}
            <NoteRow note={note} dateField={dateField} />
        </React.Fragment>
    ));
}

// ─── NoteList ─────────────────────────────────────────────────────────────────

function NoteList({ tag, prefix }) {
    const theme = useTheme();
    const g = graphiteTokens(theme);
    const isPhone = useMediaQuery(theme.breakpoints.down('md'));
    const [tagsOpen, setTagsOpen] = useState(false);
    const [typeFilter, setTypeFilter] = useState(null);
    const [sortBy, setSortBy] = useState('updated');

    const { loading: isLoadingList, error, data, refetch } = useQuery(GET_NOTES, {
        variables: { tag, prefix, type: typeFilter, limit: 200 },
        fetchPolicy: 'cache-and-network',
    });

    const notes = React.useMemo(() => data?.notes || [], [data]);

    // Client-side sort — the resolver already returns by updatedAt desc,
    // but we offer created/title sorts too. For 'updated' we skip re-sorting.
    const sortedNotes = React.useMemo(() => {
        if (sortBy === 'updated') return notes;
        const arr = [...notes];
        if (sortBy === 'created') {
            arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        } else if (sortBy === 'title') {
            arr.sort((a, b) => (a.title || 'Untitled').localeCompare(b.title || 'Untitled'));
        }
        return arr;
    }, [notes, sortBy]);

    // Recency groups apply to the two date sorts only; A–Z is one run.
    const dateField = sortBy === 'created' ? 'createdAt' : 'updatedAt';
    const groups = React.useMemo(
        () => (sortBy === 'title' ? null : groupByRecency(sortedNotes, { field: dateField })),
        [sortedNotes, sortBy, dateField]
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
            {/* ── Count, tags (phone), sort ─────────────────────────── */}
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                mb: '4px',
                px: '4px',
            }}>
                <Typography variant="h6" component="h2" sx={{ color: 'text.secondary', m: 0, mr: 'auto' }}>
                    {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </Typography>

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

            {/* The list — grouped by recency for date sorts */}
            {sortedNotes.length === 0 ? (
                <GeekEmptyState
                    title={tag ? 'No notes tagged here yet.' : 'No notes yet'}
                    description={!tag ? 'Create your first note to get started' : undefined}
                />
            ) : groups ? (
                groups.map((group) => (
                    <Box component="section" key={group.key} aria-label={group.label}>
                        <GroupHeading label={group.label} count={group.notes.length} />
                        <RowList notes={group.notes} dateField={dateField} />
                    </Box>
                ))
            ) : (
                <Box sx={{ pt: '8px' }}>
                    <RowList notes={sortedNotes} dateField={dateField} />
                </Box>
            )}
        </Box>
    );
}

export default NoteList;

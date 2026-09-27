import React, { useState } from 'react';
import {
    Typography,
    Box,
    ButtonBase,
    Skeleton,
    Divider,
    useTheme,
} from '@mui/material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import { gql, useQuery } from '@apollo/client';
import NoteRow from './notes/NoteRow';
import { border, glow, layout, tapTarget44 } from '../theme/tokens';
import TypeStamp from './notes/TypeStamp';
import { NOTE_TYPE_ORDER } from './notes/noteTypeMeta';
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

// Type filters — the same stamps as everywhere else, plus "All".
const TYPE_FILTERS = [null, ...NOTE_TYPE_ORDER];

// Sort options
const SORT_OPTIONS = [
    { value: 'updated', label: 'Recent' },
    { value: 'created', label: 'Created' },
    { value: 'title',   label: 'A-Z' },
];

/**
 * A recency heading: typewritten label, a hairline, and the bucket's count.
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
            {/* ── Filter + sort controls ──────────────────────────────── */}
            <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1,
                mb: 1.5,
                px: 0.5,
            }}>
                {/* Count label */}
                <Typography variant="h6" component="h2" sx={{ color: 'text.secondary', m: 0 }}>
                    {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </Typography>

                {/* Sort dropdown — compact text buttons */}
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {SORT_OPTIONS.map((opt) => (
                        <ButtonBase
                            key={opt.value}
                            onClick={() => setSortBy(opt.value)}
                            aria-pressed={sortBy === opt.value}
                            sx={{
                                ...tapTarget44,
                                px: 0.75,
                                py: 0.25,
                                borderRadius: '4px',
                                fontFamily: theme.typography.fontFamilyMono,
                                fontSize: '0.75rem',
                                fontWeight: sortBy === opt.value ? 600 : 400,
                                letterSpacing: '0.04em',
                                color: sortBy === opt.value ? 'text.primary' : 'text.secondary',
                                textDecoration: sortBy === opt.value ? 'underline' : 'none',
                                textDecorationColor: theme.palette.primary.main,
                                textDecorationThickness: '2px',
                                textUnderlineOffset: '5px',
                                transition: 'all 120ms ease',
                                '&:hover': {
                                    color: 'text.secondary',
                                    bgcolor: glow(theme).soft,
                                },
                            }}
                        >
                            {opt.label}
                        </ButtonBase>
                    ))}
                </Box>
            </Box>

            {/* Type filters */}
            <Box
                role="group"
                aria-label="Filter by type"
                sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: { xs: '0 4px', md: '8px' },
                    mb: '8px',
                    px: '4px',
                }}
            >
                {TYPE_FILTERS.map((type) => {
                    const isActive = typeFilter === type;
                    if (!type) {
                        return (
                            <ButtonBase
                                key="all"
                                onClick={() => setTypeFilter(null)}
                                aria-pressed={isActive}
                                sx={{
                                    borderRadius: '4px',
                                    [theme.breakpoints.down('md')]: { ...tapTarget44 },
                                    '&:focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 2 },
                                }}
                            >
                                <Box
                                    component="span"
                                    sx={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        height: 28,
                                        px: '10px',
                                        borderRadius: '3px',
                                        border: `1px solid ${isActive ? theme.palette.text.primary : border(theme)}`,
                                        bgcolor: isActive ? glow(theme).medium : 'transparent',
                                        fontFamily: theme.typography.fontFamilyMono,
                                        fontSize: '0.75rem',
                                        fontWeight: 600,
                                        letterSpacing: '0.06em',
                                        textTransform: 'uppercase',
                                        color: isActive ? 'text.primary' : 'text.secondary',
                                    }}
                                >
                                    All
                                </Box>
                            </ButtonBase>
                        );
                    }
                    return (
                        <TypeStamp
                            key={type}
                            type={type}
                            size="md"
                            selected={isActive}
                            onClick={() => setTypeFilter(isActive ? null : type)}
                        />
                    );
                })}
            </Box>

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

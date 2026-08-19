import React, { useState } from 'react';
import {
    Typography,
    Alert,
    Box,
    ButtonBase,
    Skeleton,
    Divider,
    useTheme,
} from '@mui/material';
import { gql, useQuery } from '@apollo/client';
import NoteRow from './notes/NoteRow';
import { NOTE_TYPES } from './notes/NoteTypeRouter';
import { border, glow, noteTypeColor } from '../theme/tokens';

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

// Type filter pills — same visual language as QuickCaptureHome type pills
const TYPE_FILTERS = [
    { type: null,              label: 'ALL' },
    { type: NOTE_TYPES.TEXT,        label: 'TEXT' },
    { type: NOTE_TYPES.MARKDOWN,    label: 'MARKDOWN' },
    { type: NOTE_TYPES.CODE,        label: 'CODE' },
    { type: NOTE_TYPES.MINDMAP,     label: 'MINDMAP' },
    { type: NOTE_TYPES.HANDWRITTEN, label: 'SKETCH' },
];

// Sort options
const SORT_OPTIONS = [
    { value: 'updated', label: 'Recent' },
    { value: 'created', label: 'Created' },
    { value: 'title',   label: 'A-Z' },
];

// ─── NoteList ─────────────────────────────────────────────────────────────────

function NoteList({ tag, prefix }) {
    const theme = useTheme();
    const [typeFilter, setTypeFilter] = useState(null);
    const [sortBy, setSortBy] = useState('updated');

    const { loading: isLoadingList, error, data } = useQuery(GET_NOTES, {
        variables: { tag, prefix, type: typeFilter, limit: 200 },
        fetchPolicy: 'cache-and-network',
    });

    const notes = data?.notes || [];
    const listError = error?.message;

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

    if (isLoadingList && !data) {
        return (
            <Box sx={{ py: 2, maxWidth: 720, mx: 'auto' }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} height={44} sx={{ borderRadius: 1, mb: 0.5 }} variant="rounded" />
                ))}
            </Box>
        );
    }

    if (listError) {
        return (
            <Alert severity="error" sx={{ width: '100%', borderRadius: 2 }}>
                {listError}
            </Alert>
        );
    }

    return (
        <Box sx={{ py: { xs: 1, sm: 1.5 }, maxWidth: 720, mx: 'auto' }}>
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
                <Typography variant="h6" sx={{ color: 'text.disabled' }}>
                    {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </Typography>

                {/* Sort dropdown — compact text buttons */}
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                    {SORT_OPTIONS.map((opt) => (
                        <ButtonBase
                            key={opt.value}
                            onClick={() => setSortBy(opt.value)}
                            sx={{
                                px: 0.75,
                                py: 0.25,
                                borderRadius: '4px',
                                fontFamily: theme.typography.fontFamilyMono,
                                fontSize: '0.6875rem',
                                fontWeight: sortBy === opt.value ? 600 : 400,
                                letterSpacing: '0.04em',
                                color: sortBy === opt.value ? 'primary.main' : 'text.disabled',
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

            {/* Type filter pills */}
            <Box sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.75,
                mb: 2,
                px: 0.5,
            }}>
                {TYPE_FILTERS.map((pill) => {
                    const isActive = typeFilter === pill.type;
                    const color = pill.type ? noteTypeColor(theme, pill.type) : theme.palette.primary.main;
                    return (
                        <ButtonBase
                            key={pill.label}
                            onClick={() => setTypeFilter(pill.type)}
                            sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.625,
                                px: 1,
                                py: 0.375,
                                borderRadius: '4px',
                                border: `1px solid ${isActive ? color : border(theme)}`,
                                bgcolor: isActive ? glow(theme).soft : 'transparent',
                                fontFamily: theme.typography.fontFamilyMono,
                                fontSize: '0.6875rem',
                                fontWeight: 500,
                                letterSpacing: '0.04em',
                                color: isActive ? color : 'text.secondary',
                                transition: 'all 120ms ease',
                                '&:hover': {
                                    bgcolor: glow(theme).soft,
                                    borderColor: color,
                                    color,
                                },
                            }}
                        >
                            {pill.type && (
                                <Box
                                    sx={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: '50%',
                                        bgcolor: color,
                                        flexShrink: 0,
                                    }}
                                />
                            )}
                            {pill.label}
                        </ButtonBase>
                    );
                })}
            </Box>

            {/* Editorial list */}
            {sortedNotes.length === 0 ? (
                <Box sx={{ py: 8, textAlign: 'center' }}>
                    <Typography variant="body1" sx={{ color: 'text.disabled', mb: 0.5 }}>
                        {tag ? 'No notes tagged here yet.' : 'No notes yet'}
                    </Typography>
                    {!tag && (
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                            Create your first note to get started
                        </Typography>
                    )}
                </Box>
            ) : (
                <Box>
                    {sortedNotes.map((note, idx) => (
                        <React.Fragment key={note.id || note._id}>
                            {idx > 0 && (
                                <Divider sx={{ borderColor: theme.palette.divider }} />
                            )}
                            <NoteRow note={note} />
                        </React.Fragment>
                    ))}
                </Box>
            )}
        </Box>
    );
}

export default NoteList;

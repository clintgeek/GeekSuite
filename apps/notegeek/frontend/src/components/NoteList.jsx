import React from 'react';
import { Link } from 'react-router-dom';
import {
    Typography,
    Alert,
    Box,
    ButtonBase,
    Skeleton,
    Divider,
    useTheme,
} from '@mui/material';
import useNoteStore from '../store/noteStore';
import { formatRelativeTime } from '../utils/dateUtils';
import { previewText } from '../utils/previewText';
import { gql, useQuery } from '@apollo/client';

const GET_NOTES = gql`
    query GetNotes($tag: String, $prefix: String) {
        notes(tag: $tag, prefix: $prefix) {
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

function getTypeColor(type, palette) {
    return palette.noteTypes?.[type] || palette.noteTypes?.text || palette.primary.main;
}

function getPreview(note) {
    if (note.snippet) return note.snippet;
    return previewText(note.content, note.type || 'text', 120);
}

// ─── NoteRow: one note in the editorial list ─────────────────────────────────

function NoteRow({ note }) {
    const theme = useTheme();
    const type = note.type || 'text';
    const typeColor = getTypeColor(type, theme.palette);
    const preview = getPreview(note);

    return (
        <ButtonBase
            component={Link}
            to={`/notes/${note.id || note._id}`}
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 1.5,
                width: '100%',
                textAlign: 'left',
                py: 1.25,
                px: 0.5,
                borderRadius: 0,
                textDecoration: 'none',
                color: 'inherit',
                transition: 'background 120ms ease',
                '&:hover': {
                    bgcolor: theme.palette.glow.soft,
                    '& .type-dot': { transform: 'scale(1.5)' },
                },
            }}
        >
            {/* Type-color identity dot */}
            <Box
                className="type-dot"
                sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    bgcolor: typeColor,
                    flexShrink: 0,
                    mt: preview ? '7px' : '6px',
                    transition: 'transform 120ms ease',
                }}
            />

            {/* Title + preview */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                    variant="body1"
                    sx={{
                        color: 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.45,
                    }}
                >
                    {note.title || 'Untitled'}
                </Typography>
                {preview && (
                    <Typography
                        variant="caption"
                        sx={{
                            display: 'block',
                            color: 'text.secondary',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.5,
                            mt: 0.25,
                        }}
                    >
                        {preview}
                    </Typography>
                )}
            </Box>

            {/* Tag pills — hidden on xs */}
            {note.tags && note.tags.length > 0 && (
                <Box
                    sx={{
                        display: { xs: 'none', sm: 'flex' },
                        gap: 0.5,
                        flexShrink: 0,
                        alignSelf: 'center',
                    }}
                >
                    {note.tags.slice(0, 2).map((tag) => (
                        <Typography
                            key={tag}
                            variant="caption"
                            sx={{
                                px: 0.75,
                                py: 0.125,
                                borderRadius: '4px',
                                border: `1px solid ${theme.palette.border}`,
                                bgcolor: theme.palette.glow.soft,
                                color: 'text.secondary',
                                lineHeight: '18px',
                            }}
                        >
                            {tag.split('/').pop()}
                        </Typography>
                    ))}
                </Box>
            )}

            {/* Timestamp */}
            <Typography
                variant="caption"
                sx={{
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: 'right',
                    color: 'text.disabled',
                    alignSelf: 'center',
                }}
            >
                {formatRelativeTime(note.updatedAt || note.createdAt)}
            </Typography>
        </ButtonBase>
    );
}

// ─── NoteList ─────────────────────────────────────────────────────────────────

function NoteList({ tag, prefix }) {
    const theme = useTheme();
    const { loading: isLoadingList, error, data } = useQuery(GET_NOTES, {
        variables: { tag, prefix },
        fetchPolicy: 'cache-and-network',
    });

    const notes = data?.notes || [];
    const listError = error?.message;

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

    if (notes.length === 0) {
        return (
            <Box sx={{ py: 8, textAlign: 'center', maxWidth: 720, mx: 'auto' }}>
                <Typography variant="body1" sx={{ color: 'text.disabled', mb: 0.5 }}>
                    {tag ? 'No notes tagged here yet.' : 'No notes yet'}
                </Typography>
                {!tag && (
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        Create your first note to get started
                    </Typography>
                )}
            </Box>
        );
    }

    const sortedNotes = [...notes].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt);
        const dateB = new Date(b.updatedAt || b.createdAt);
        return dateB - dateA;
    });

    return (
        <Box sx={{ py: { xs: 1, sm: 1.5 }, maxWidth: 720, mx: 'auto' }}>
            {/* Count label */}
            <Box sx={{ mb: 1.5, px: 0.5 }}>
                <Typography variant="h6" sx={{ color: 'text.disabled' }}>
                    {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                </Typography>
            </Box>

            {/* Editorial list */}
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
        </Box>
    );
}

export default NoteList;

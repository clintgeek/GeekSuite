import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
    Typography,
    Alert,
    Box,
    ButtonBase,
    Skeleton,
    useTheme,
    alpha,
} from '@mui/material';
import useNoteStore from '../store/noteStore';
import { formatRelativeTime } from '../utils/dateUtils';
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

const TYPE_COLORS = {
    text: { light: '#5B50A8', dark: '#A99DF0' },
    markdown: { light: '#7B5DAE', dark: '#B89BD8' },
    code: { light: '#4A8C6F', dark: '#7DB99A' },
    mindmap: { light: '#3D8493', dark: '#6DB5C0' },
    handwritten: { light: '#A85C73', dark: '#D49AAE' },
};

function getPreview(note) {
    if (note.snippet) return note.snippet;
    if (!note.content) return '';
    if (typeof note.content === 'string' && note.content.startsWith('data:image/')) return '';
    const plain = note.content.replace(/<[^>]+>/g, '');
    return plain.split(/\r?\n/).filter(Boolean).slice(0, 1).join(' ').slice(0, 120);
}

// Note row — a graspable object
function NoteRow({ note }) {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const type = note.type || 'text';
    const typeColor = TYPE_COLORS[type]
        ? (isDark ? TYPE_COLORS[type].dark : TYPE_COLORS[type].light)
        : (isDark ? '#A99DF0' : '#5B50A8');
    const preview = getPreview(note);

    return (
        <ButtonBase
            component={Link}
            to={`/notes/${note.id || note._id}`}
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                width: '100%',
                textAlign: 'left',
                py: 0.75,
                px: 1.25,
                borderRadius: 1.5,
                textDecoration: 'none',
                color: 'inherit',
                position: 'relative',
                overflow: 'hidden',
                transition: 'all 120ms ease',
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: '20%',
                    bottom: '20%',
                    width: 2,
                    borderRadius: 1,
                    bgcolor: typeColor,
                    opacity: 0,
                    transition: 'opacity 120ms ease',
                },
                '&:hover': {
                    bgcolor: alpha(theme.palette.text.primary, 0.025),
                    '&::before': { opacity: 1 },
                    '& .note-title': { fontWeight: 600 },
                },
            }}
        >
            {/* Type dot */}
            <Box
                sx={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    bgcolor: typeColor,
                    flexShrink: 0,
                    opacity: 0.7,
                    mt: preview ? 0.5 : 0,
                    alignSelf: preview ? 'flex-start' : 'center',
                }}
            />

            {/* Title + preview */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                    className="note-title"
                    sx={{
                        fontWeight: 450,
                        fontSize: '0.8rem',
                        color: 'text.primary',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.4,
                        transition: 'font-weight 120ms ease',
                    }}
                >
                    {note.title || 'Untitled'}
                </Typography>
                {preview && (
                    <Typography
                        sx={{
                            fontSize: '0.6875rem',
                            color: 'text.disabled',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.4,
                        }}
                    >
                        {preview}
                    </Typography>
                )}
            </Box>

            {/* Tags */}
            {note.tags && note.tags.length > 0 && (
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, flexShrink: 0 }}>
                    {note.tags.slice(0, 2).map((tag) => (
                        <Typography
                            key={tag}
                            sx={{
                                fontSize: '0.625rem',
                                color: 'text.disabled',
                                bgcolor: alpha(theme.palette.text.primary, 0.035),
                                px: 0.625,
                                py: 0.0625,
                                borderRadius: 0.5,
                            }}
                        >
                            {tag.split('/').pop()}
                        </Typography>
                    ))}
                </Box>
            )}

            {/* Time */}
            <Typography
                sx={{
                    fontSize: '0.625rem',
                    color: 'text.disabled',
                    flexShrink: 0,
                    minWidth: 44,
                    textAlign: 'right',
                }}
            >
                {formatRelativeTime(note.updatedAt || note.createdAt)}
            </Typography>
        </ButtonBase>
    );
}

function NoteList({ tag, prefix }) {
    const { loading: isLoadingList, error, data } = useQuery(GET_NOTES, {
        variables: { tag, prefix },
        fetchPolicy: 'cache-and-network',
    });

    const notes = data?.notes || [];
    const listError = error?.message;

    if (isLoadingList && !data) {
        return (
            <Box sx={{ py: 2, maxWidth: 680, mx: 'auto' }}>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton key={i} height={36} sx={{ borderRadius: 1.5, mb: 0.25 }} />
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
            <Box sx={{ py: 8, textAlign: 'center', maxWidth: 680, mx: 'auto' }}>
                <Typography sx={{ fontSize: '0.8125rem', color: 'text.disabled', mb: 0.5 }}>
                    No notes yet
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>
                    Create your first note to get started
                </Typography>
            </Box>
        );
    }

    const sortedNotes = [...notes].sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt);
        const dateB = new Date(b.updatedAt || b.createdAt);
        return dateB - dateA;
    });

    return (
        <Box sx={{ py: { xs: 1, sm: 1.5 }, maxWidth: 680, mx: 'auto' }}>
            <Typography
                variant="overline"
                sx={{
                    display: 'block',
                    color: 'text.disabled',
                    mb: 0.5,
                    px: 0.5,
                }}
            >
                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {sortedNotes.map((note) => (
                    <NoteRow key={note.id || note._id} note={note} />
                ))}
            </Box>
        </Box>
    );
}

export default NoteList;
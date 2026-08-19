import React from 'react';
import { Link } from 'react-router-dom';
import {
    Typography,
    Box,
    ButtonBase,
    useTheme,
} from '@mui/material';
import { formatRelativeTime } from '../../utils/dateUtils';
import { previewText } from '../../utils/previewText';
import { border, glow, noteTypeColor, layout } from '../../theme/tokens';

// ─── helpers ──────────────────────────────────────────────────────────────────

const VISUAL_TYPES = ['handwritten', 'mindmap'];

function getPreview(note, maxLen = 120) {
    if (note.snippet) return note.snippet;
    const type = note.type || 'text';
    if (VISUAL_TYPES.includes(type)) return '';
    return previewText(note.content, type, maxLen);
}

function highlightQuery(text, query, highlightColor) {
    if (!query || !text) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
            ? <span key={i} style={{ color: highlightColor }}>{part}</span>
            : part
    );
}

// ─── NoteRow ──────────────────────────────────────────────────────────────────

/**
 * Shared editorial list row for notes.
 *
 * Props:
 *  - note:        the note object (id/_id, title, content, type, tags, updatedAt/createdAt)
 *  - to:          if provided, renders as a Link to this path
 *  - onClick:     if provided (and no `to`), renders as a ButtonBase with click handler
 *  - query:       optional search query for term highlighting
 *  - maxPreview:  max preview length (default 120)
 */
function NoteRow({ note, to, onClick, query, maxPreview = 120 }) {
    const theme = useTheme();
    const type = note.type || 'text';
    const typeColor = noteTypeColor(theme, type);
    const preview = getPreview(note, maxPreview);
    const highlightColor = theme.palette.primary.main;

    const noteId = note.id || note._id;
    const linkTo = to || `/notes/${noteId}`;

    const buttonProps = to || !onClick
        ? { component: Link, to: linkTo }
        : { onClick };

    return (
        <ButtonBase
            {...buttonProps}
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
                    bgcolor: glow(theme).soft,
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
                    {query
                        ? highlightQuery(note.title || 'Untitled', query, highlightColor)
                        : (note.title || 'Untitled')}
                </Typography>
                {preview && (
                    <Typography
                        variant="caption"
                        component="div"
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
                        {query
                            ? highlightQuery(preview, query, highlightColor)
                            : preview}
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
                                border: `1px solid ${border(theme)}`,
                                bgcolor: glow(theme).soft,
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
                    minWidth: layout.timestampMinWidth,
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

export default NoteRow;

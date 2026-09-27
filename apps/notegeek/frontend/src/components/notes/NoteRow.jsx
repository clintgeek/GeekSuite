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
import { glow } from '../../theme/tokens';
import TypeStamp from './TypeStamp';
import { CodePreview, NoteThumb } from './NotePreview';

// ─── helpers ──────────────────────────────────────────────────────────────────

const VISUAL_TYPES = ['handwritten', 'mindmap'];

function getPreview(note, maxLen = 120) {
    if (note.snippet) return note.snippet;
    const type = note.type || 'text';
    if (VISUAL_TYPES.includes(type)) return '';
    return previewText(note.content, type, maxLen, { shape: true });
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
 * Shared list row for notes — the same on phone and desktop:
 *
 *   Title ······························ [thumb]
 *   preview (prose clamp, or tinted code)  [    ]
 *   [TYPE STAMP] #tag #tag +1 ·········· 2h ago
 *
 * The type stamp and up to two tags are always shown (they used to vanish
 * below `md`, leaving every phone row identical but for its title). The
 * relative time sits at the end of the meta line in quiet mono rather than
 * in its own column. Sketch and mind-map notes get a thumbnail
 * (NotePreview.jsx), lazily rendered.
 *
 * Props:
 *  - note:        the note object (id/_id, title, content, type, tags, updatedAt/createdAt)
 *  - to:          if provided, renders as a Link to this path
 *  - onClick:     if provided (and no `to`), renders as a ButtonBase with click handler
 *  - query:       optional search query for term highlighting
 *  - maxPreview:  max preview length (default 120)
 *  - dateField:   which timestamp the row shows ('updatedAt' | 'createdAt')
 */
function NoteRow({ note, to, onClick, query, maxPreview = 160, dateField = 'updatedAt' }) {
    const theme = useTheme();
    const type = note.type || 'text';
    const isVisual = VISUAL_TYPES.includes(type);
    const isCode = type === 'code' && !note.snippet;
    const preview = isCode ? '' : getPreview(note, maxPreview);
    const highlightColor = theme.palette.primary.main;

    const noteId = note.id || note._id;
    const linkTo = to || `/notes/${noteId}`;

    const buttonProps = to || !onClick
        ? { component: Link, to: linkTo }
        : { onClick };

    const tags = note.tags || [];
    const when = note[dateField] || note.updatedAt || note.createdAt;

    return (
        <ButtonBase
            {...buttonProps}
            data-note-row={type}
            sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                width: '100%',
                minHeight: 44,
                textAlign: 'left',
                py: '12px',
                px: '8px',
                borderRadius: '4px',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'background-color 120ms ease',
                '&:hover': { bgcolor: glow(theme).soft },
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: -2 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
        >
            <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* Title */}
                <Typography
                    component="div"
                    sx={{
                        color: 'text.primary',
                        fontWeight: 600,
                        fontSize: '0.9375rem',
                        letterSpacing: '-0.005em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        lineHeight: 1.4,
                    }}
                >
                    {query
                        ? highlightQuery(note.title || 'Untitled', query, highlightColor)
                        : (note.title || 'Untitled')}
                </Typography>

                {/* Preview — prose or code */}
                {isCode ? (
                    <CodePreview content={note.content} />
                ) : preview ? (
                    <Typography
                        component="div"
                        sx={{
                            color: 'text.secondary',
                            fontSize: '0.8125rem',
                            lineHeight: 1.5,
                            mt: '2px',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            wordBreak: 'break-word',
                        }}
                    >
                        {query ? highlightQuery(preview, query, highlightColor) : preview}
                    </Typography>
                ) : null}

                {/* Meta line: type stamp, tags, time */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        mt: '8px',
                        minWidth: 0,
                    }}
                >
                    <TypeStamp type={type} />
                    {tags.slice(0, 2).map((tag) => (
                        <Typography
                            key={tag}
                            component="span"
                            variant="caption"
                            title={tag}
                            sx={{
                                color: 'text.secondary',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                minWidth: 0,
                                maxWidth: 140,
                                lineHeight: 1,
                            }}
                        >
                            #{tag.split('/').pop()}
                        </Typography>
                    ))}
                    {tags.length > 2 && (
                        <Typography component="span" variant="caption" sx={{ color: 'text.secondary', lineHeight: 1, flexShrink: 0 }}>
                            +{tags.length - 2}
                        </Typography>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Typography
                        component="span"
                        variant="caption"
                        sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1 }}
                    >
                        {formatRelativeTime(when)}
                    </Typography>
                </Box>
            </Box>

            {isVisual && <NoteThumb note={note} />}
        </ButtonBase>
    );
}

export default NoteRow;

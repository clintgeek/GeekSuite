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
import { graphiteTokens } from '../../theme/tokens';
import TypeIcon from './TypeIcon';
import { CodePreview, NoteThumb } from './NotePreview';

// ─── helpers ──────────────────────────────────────────────────────────────────

const VISUAL_TYPES = ['handwritten', 'mindmap'];

function getPreview(note, maxLen = 120) {
    if (note.snippet) return note.snippet;
    const type = note.type || 'text';
    if (VISUAL_TYPES.includes(type)) return '';
    return previewText(note.content, type, maxLen, { shape: true });
}

/** Search hits under a pass of highlighter (`mark`, styled in the theme). */
function highlightQuery(text, query) {
    if (!query || !text) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
            ? <mark key={i}>{part}</mark>
            : part
    );
}

// ─── NoteRow ──────────────────────────────────────────────────────────────────

/**
 * Shared list row for notes — the same on phone and desktop:
 *
 *   Title ······························ [thumb]
 *   preview (prose clamp, or tinted code)  [    ]
 *   ⌇ work · planning ·················· 2h ago
 *
 * Quiet by design (Graphite): the type is a small graphite glyph with an
 * accessible label, tags are plain words, and the time is small lowercase
 * mono at the end of the line. The title is the loudest thing in the row.
 * Sketch and mind-map notes get a thumbnail (NotePreview.jsx), lazily
 * rendered.
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
    const g = graphiteTokens(theme);

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
                '&:hover': { bgcolor: g.paper },
                '&:focus-visible': { outline: `2px solid ${g.ink}`, outlineOffset: -2 },
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
                        ? highlightQuery(note.title || 'Untitled', query)
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
                        {query ? highlightQuery(preview, query) : preview}
                    </Typography>
                ) : null}

                {/* Meta line: type glyph, tags, time */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        mt: '6px',
                        minWidth: 0,
                    }}
                >
                    <TypeIcon type={type} size={15} />
                    {tags.length > 0 && (
                        <Typography
                            component="span"
                            title={tags.join(', ')}
                            sx={{
                                color: 'text.secondary',
                                fontSize: '0.8125rem',
                                lineHeight: 1.2,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                minWidth: 0,
                            }}
                        >
                            {tags.slice(0, 2).map((tag) => tag.split('/').pop()).join(' · ')}
                            {tags.length > 2 ? ` +${tags.length - 2}` : ''}
                        </Typography>
                    )}
                    <Box sx={{ flex: 1 }} />
                    <Typography
                        component="span"
                        variant="caption"
                        sx={{ color: 'text.secondary', whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1.2 }}
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

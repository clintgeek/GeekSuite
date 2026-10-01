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
import { rowTagLabels } from '../../utils/tagPath';
import { highlightTerms } from '../../utils/highlightTerms';
import { graphiteTokens } from '../../theme/tokens';
import TypeIcon from './TypeIcon';
import { CodePreview, NoteThumb } from './NotePreview';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import PushPin from '@mui/icons-material/PushPin';

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
    const terms = highlightTerms(query);
    if (!terms.length) return text;
    // Longest first, so "garages" wins over "garage" where both are terms.
    const pattern = terms
        .sort((a, b) => b.length - a.length)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const parts = text.split(new RegExp(`(${pattern})`, 'gi'));
    return parts.map((part, i) =>
        terms.includes(part.toLowerCase())
            ? <mark key={i}>{part}</mark>
            : part
    );
}

/**
 * A pinned note's quiet marker — same visual weight as `TypeIcon` (size,
 * `text.secondary`), rendered only when the note is pinned so its
 * accessible name ("Pinned") exists only then. No yellow: the highlighter
 * accent is a fill behind ink, never a glyph or text colour on its own.
 */
function PinGlyph({ size = 14 }) {
    return (
        <Box
            component="span"
            role="img"
            aria-label="Pinned"
            title="Pinned"
            sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'text.secondary',
                lineHeight: 0,
            }}
        >
            <PushPin aria-hidden sx={{ fontSize: size }} />
        </Box>
    );
}

/**
 * A search hit found by MEANING, not by the typed words (hybrid search,
 * DOCS/CONTEXT.md §11). Without it a row with no highlighted word looks like
 * a bug. Quiet: small secondary text in the meta line, like the tags.
 */
function MeaningMark() {
    return (
        <Typography
            component="span"
            data-match="meaning"
            title="Found by meaning: it may not contain the words you typed"
            sx={{
                color: 'text.secondary',
                fontSize: '0.75rem',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                fontStyle: 'italic',
            }}
        >
            similar
        </Typography>
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
 *  - tagContext:  the tag view this row is listed in, if any. Inside `house`
 *                 a note tagged `house/garage` reads `garage` (the sub-tag it
 *                 sits in), first — see `rowTagLabels` in utils/tagPath.js.
 *  - prominent:   search's "Best match" (DOCS/CONTEXT.md §11): the passage
 *                 that matched (`why`) whenever there is one, not only for a
 *                 meaning hit, clamped at four lines instead of two.
 */
function NoteRow({ note, to, onClick, query, maxPreview = 160, dateField = 'updatedAt', tagContext = null, prominent = false }) {
    const theme = useTheme();
    const type = note.type || 'text';
    const isVisual = VISUAL_TYPES.includes(type);
    // Hybrid search: a row matched by meaning alone shows the passage that
    // matched and is marked, and nothing in it is highlighted — the typed
    // words are, by definition, not what found it.
    const byMeaning = note.matchedBy === 'meaning';
    const why = (byMeaning || prominent) && note.why ? note.why : null;
    const isCode = type === 'code' && !note.snippet && !why;
    const preview = isCode ? '' : (why || getPreview(note, maxPreview));
    const highlight = byMeaning ? null : query;
    const g = graphiteTokens(theme);

    const noteId = note.id || note._id;
    const linkTo = to || `/notes/${noteId}`;

    const buttonProps = to || !onClick
        ? { component: Link, to: linkTo }
        : { onClick };

    const tags = note.tags || [];
    const tagLabels = rowTagLabels(tags, tagContext);
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
                    {highlight
                        ? highlightQuery(note.title || 'Untitled', highlight)
                        : (note.title || 'Untitled')}
                </Typography>

                {/* Preview — prose or code */}
                {isCode ? (
                    <CodePreview content={note.content} />
                ) : preview ? (
                    <Typography
                        component="div"
                        sx={{
                            color: prominent ? 'text.primary' : 'text.secondary',
                            fontSize: prominent ? '0.875rem' : '0.8125rem',
                            lineHeight: 1.5,
                            mt: prominent ? '4px' : '2px',
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: prominent ? 4 : 2,
                            WebkitBoxOrient: 'vertical',
                            wordBreak: 'break-word',
                        }}
                    >
                        {highlight ? highlightQuery(preview, highlight) : preview}
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
                    {note.pinned && <PinGlyph size={14} />}
                    <TypeIcon type={type} size={15} />
                    {byMeaning && <MeaningMark />}
                    {tagLabels.length > 0 && (
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
                            {tagLabels.slice(0, 2).join(' · ')}
                            {tagLabels.length > 2 ? ` +${tagLabels.length - 2}` : ''}
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

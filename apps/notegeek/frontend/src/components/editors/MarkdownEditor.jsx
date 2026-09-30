import React, { useLayoutEffect, useRef, useState } from 'react';
import {
    Box,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import FormatBold from '@mui/icons-material/FormatBold';
import FormatItalic from '@mui/icons-material/FormatItalic';
import TitleIcon from '@mui/icons-material/Title';
import FormatListBulleted from '@mui/icons-material/FormatListBulleted';
import CheckBoxOutlined from '@mui/icons-material/CheckBoxOutlined';
import FormatQuote from '@mui/icons-material/FormatQuote';
import Code from '@mui/icons-material/Code';
import LinkIcon from '@mui/icons-material/Link';
import EditorToolbar, { ToolButton, ToolSeparator } from './EditorToolbar';
import { insertLink, toggleLinePrefix, toggleWrap } from '../../utils/markdownFormat';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import Edit from '@mui/icons-material/Edit';
import Visibility from '@mui/icons-material/Visibility';
import VerticalSplit from '@mui/icons-material/VerticalSplit';
import ReactMarkdown from 'react-markdown';
// See NoteViewer: the preview and the viewer must agree about what markdown
// is, or the editor shows something the saved note will not.
import { MARKDOWN_COMPONENTS, MARKDOWN_REMARK_PLUGINS, markdownOverflowSx } from '../notes/markdownComponents';
import { graphiteTokens, tapTarget44 } from '../../theme/tokens';

/**
 * MarkdownEditor — markdown editing with live preview, rendered by
 * react-markdown. Three modes: edit, preview, split (desktop only).
 *
 * The toolbar (EditorToolbar) carries markdown formatting — heading, bold,
 * italic, list, checklist, quote, code, link — as edits to the textarea's
 * own text (utils/markdownFormat.js), and the mode switch. On a phone it docks
 * above the keyboard; the formatting buttons hide in preview, where there is
 * no text to format.
 *
 * The source is written in the sans, not mono: a markdown note is prose that
 * happens to have a few asterisks in it.
 *
 * The AI Tidy button lived here until 2026-09-22 and was removed with the
 * feature (see `DOCS/WORK_LOG_2026-09.md`). Compose, in the note's action row,
 * is what replaced it.
 */
const FORMATS = [
    { label: 'Heading', Icon: TitleIcon, apply: (t, a, b) => toggleLinePrefix(t, a, b, '## ') },
    { label: 'Bold', Icon: FormatBold, apply: (t, a, b) => toggleWrap(t, a, b, '**') },
    { label: 'Italic', Icon: FormatItalic, apply: (t, a, b) => toggleWrap(t, a, b, '_') },
    'sep',
    { label: 'Bullet list', Icon: FormatListBulleted, apply: (t, a, b) => toggleLinePrefix(t, a, b, '- ') },
    { label: 'Checklist', Icon: CheckBoxOutlined, apply: (t, a, b) => toggleLinePrefix(t, a, b, '- [ ] ') },
    { label: 'Quote', Icon: FormatQuote, apply: (t, a, b) => toggleLinePrefix(t, a, b, '> ') },
    'sep',
    { label: 'Code', Icon: Code, apply: (t, a, b) => toggleWrap(t, a, b, '`') },
    { label: 'Link', Icon: LinkIcon, apply: (t, a, b) => insertLink(t, a, b) },
];

function MarkdownEditor({ content = '', setContent, isLoading, readOnly = false, fontSize = 14 }) {
    const theme = useTheme();
    const isMobile = useMediaQuery('(max-width:600px)');
    const g = graphiteTokens(theme);
    const [viewMode, setViewMode] = useState(readOnly ? 'preview' : 'edit');
    const inputRef = useRef(null);
    // Where the selection goes after a toolbar edit re-renders the text.
    const pendingSelection = useRef(null);
    useLayoutEffect(() => {
        const sel = pendingSelection.current;
        const el = inputRef.current;
        if (!sel || !el) return;
        pendingSelection.current = null;
        el.focus({ preventScroll: true });
        el.setSelectionRange(sel.start, sel.end);
    });

    const applyFormat = (format) => {
        const el = inputRef.current;
        const start = el ? el.selectionStart : content.length;
        const end = el ? el.selectionEnd : content.length;
        const edit = format.apply(content, start, end);
        pendingSelection.current = { start: edit.start, end: edit.end };
        setContent(edit.text);
    };
    // On mobile, only allow edit or preview (no split)
    const handleViewModeChange = (event, newMode) => {
        if (newMode !== null) {
            setViewMode(newMode);
        }
    };

    const renderEditor = () => (
        <TextField
            placeholder="Start writing…"
            inputRef={inputRef}
            inputProps={{ 'aria-label': 'Note body' }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            multiline
            fullWidth
            variant="standard"
            disabled={isLoading || readOnly}
            InputProps={{
                disableUnderline: true,
            }}
            sx={{
                // The scroll lives on the input ROOT, and the textarea inside
                // it is left alone to grow — the same shape RichTextEditor
                // uses, where ProseMirror's content div grows and its wrapper
                // scrolls.
                //
                // This used to set `height: 100% !important` and
                // `overflow: auto !important` on `.MuiInputBase-input`, which
                // looked like "make the textarea fill the pane" and did the
                // opposite. A `multiline` TextField grows by measuring the
                // content with a hidden shadow textarea and writing the result
                // to the visible one as an INLINE height; `!important` in a
                // stylesheet outranks an inline style, so the measurement was
                // computed correctly and then thrown away. Measured on a
                // note with 80 sections: inline height 8956px, computed height
                // 44.78px — collapsed to about one line, with the whole note
                // scrolling inside that sliver.
                //
                // Since the Lab Notebook pass the page (NoteShell) is the
                // scroller, so the root no longer scrolls either: it grows
                // with the textarea, and the sheet scrolls around it.
                '& .MuiInputBase-root': {
                    alignItems: 'flex-start',
                    p: 0,
                    minHeight: '40vh',
                },
                '& .MuiInputBase-input': {
                    fontFamily: theme.typography.fontFamily,
                    fontSize: `${Math.max(fontSize, 16)}px`,
                    lineHeight: 1.65,
                    '&::placeholder': { color: 'text.secondary', opacity: 1 },
                },
            }}
        />
    );

    const renderPreview = () => (
        <Box
            sx={{
                ...markdownOverflowSx,
                minHeight: '40vh',
                '& > :first-child': { mt: 0 },
                '& h1, & h2, & h3, & h4, & h5, & h6': {
                    mt: 2,
                    mb: 1,
                    fontWeight: 600,
                },
                '& h1': { fontSize: '1.75rem' },
                '& h2': { fontSize: '1.5rem' },
                '& h3': { fontSize: '1.25rem' },
                '& p': { mb: 1.5, lineHeight: 1.6 },
                '& ul, & ol': { pl: 3, mb: 1.5 },
                '& li': { mb: 0.5 },
                '& code': {
                    fontFamily: theme.typography.fontFamilyMono,
                    fontSize: '0.85em',
                    bgcolor: 'action.hover',
                    px: 0.5,
                    py: 0.25,
                    borderRadius: 0.5,
                },
                '& pre': {
                    bgcolor: 'action.hover',
                    p: 1.5,
                    borderRadius: 1,
                    overflow: 'auto',
                    '& code': {
                        bgcolor: 'transparent',
                        p: 0,
                    },
                },
                '& blockquote': {
                    borderLeft: 2,
                    borderColor: 'divider',
                    pl: 2,
                    ml: 0,
                    color: 'text.secondary',
                    fontStyle: 'italic',
                },
                '& a': {
                    color: 'text.primary',
                    textDecoration: 'underline',
                    textDecorationColor: g.border,
                    textUnderlineOffset: '2px',
                    '&:hover': { textDecorationColor: 'currentColor' },
                },
                '& hr': {
                    border: 'none',
                    borderTop: 1,
                    borderColor: 'divider',
                    my: 2,
                },
                '& img': {
                    maxWidth: '100%',
                    height: 'auto',
                },
                '& table': {
                    borderCollapse: 'collapse',
                    width: '100%',
                    mb: 2,
                },
                '& th, & td': {
                    border: 1,
                    borderColor: 'divider',
                    p: 1,
                    textAlign: 'left',
                },
                '& th': {
                    bgcolor: 'action.hover',
                    fontWeight: 600,
                },
            }}
        >
            {content ? (
                <ReactMarkdown remarkPlugins={MARKDOWN_REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>{content}</ReactMarkdown>
            ) : (
                <Box sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                    Nothing to preview yet...
                </Box>
            )}
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: '1 0 auto' }}>
            {!readOnly && (
                <EditorToolbar
                    label="Markdown formatting"
                    trailing={
                        <ToggleButtonGroup
                            value={viewMode}
                            exclusive
                            onChange={handleViewModeChange}
                            size="small"
                            aria-label="Markdown view"
                            sx={{
                                gap: '2px',
                                '& .MuiToggleButton-root': {
                                    border: 0,
                                    borderRadius: '6px !important',
                                    px: '10px',
                                    py: '4px',
                                    gap: '6px',
                                    fontSize: '0.8125rem',
                                    fontWeight: 500,
                                    textTransform: 'none',
                                    color: 'text.secondary',
                                    [theme.breakpoints.down('md')]: { ...tapTarget44, px: '8px' },
                                    '&.Mui-selected, &.Mui-selected:hover': {
                                        color: g.onHl,
                                        bgcolor: g.hl,
                                    },
                                    '& svg': { fontSize: 17 },
                                },
                            }}
                        >
                            <ToggleButton value="edit" aria-label="edit mode">
                                <Edit fontSize="small" />
                                {!isMobile && 'Edit'}
                            </ToggleButton>
                            {!isMobile && (
                                <ToggleButton value="split" aria-label="split mode">
                                    <VerticalSplit fontSize="small" />
                                    Split
                                </ToggleButton>
                            )}
                            <ToggleButton value="preview" aria-label="preview mode">
                                <Visibility fontSize="small" />
                                {!isMobile && 'Preview'}
                            </ToggleButton>
                        </ToggleButtonGroup>
                    }
                >
                    {viewMode !== 'preview' && FORMATS.map((f, i) => (
                        f === 'sep'
                            ? <ToolSeparator key={`sep-${i}`} />
                            : (
                                <ToolButton key={f.label} label={f.label} onClick={() => applyFormat(f)}>
                                    <f.Icon />
                                </ToolButton>
                            )
                    ))}
                </EditorToolbar>
            )}

            {/* Content area — grows; the page scrolls */}
            <Box sx={{ flex: '1 0 auto', display: 'flex', gap: viewMode === 'split' ? '24px' : 0 }}>
                {viewMode === 'edit' && (
                    <Box sx={{ width: '100%' }}>
                        {renderEditor()}
                    </Box>
                )}

                {viewMode === 'preview' && (
                    <Box sx={{ width: '100%' }}>
                        {renderPreview()}
                    </Box>
                )}

                {viewMode === 'split' && (
                    <>
                        <Box sx={{ width: '50%', pr: '24px', borderRight: 1, borderColor: 'divider' }}>
                            {renderEditor()}
                        </Box>
                        <Box sx={{ width: '50%' }}>
                            {renderPreview()}
                        </Box>
                    </>
                )}
            </Box>

        </Box>
    );
}

export default MarkdownEditor;

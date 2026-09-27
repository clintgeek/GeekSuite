import React, { useState } from 'react';
import {
    Box,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    useMediaQuery,
    useTheme,
} from '@mui/material';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import Edit from '@mui/icons-material/Edit';
import Visibility from '@mui/icons-material/Visibility';
import VerticalSplit from '@mui/icons-material/VerticalSplit';
import ReactMarkdown from 'react-markdown';
// See NoteViewer: the preview and the viewer must agree about what markdown
// is, or the editor shows something the saved note will not.
import remarkGfm from 'remark-gfm';
import { stampFill, stampInk, surfaces } from '../../theme/tokens';

/**
 * MarkdownEditor — markdown editing with live preview, rendered by
 * react-markdown. Three modes: edit, preview, split (desktop only).
 *
 * The AI Tidy button lived here until 2026-09-22 and was removed with the
 * feature (see `DOCS/WORK_LOG_2026-09.md`). Compose, in the note's action row,
 * is what replaced it.
 */
function MarkdownEditor({ content = '', setContent, isLoading, readOnly = false, fontSize = 14 }) {
    const theme = useTheme();
    const isMobile = useMediaQuery('(max-width:600px)');
    const [viewMode, setViewMode] = useState(readOnly ? 'preview' : 'edit');
    // On mobile, only allow edit or preview (no split)
    const handleViewModeChange = (event, newMode) => {
        if (newMode !== null) {
            setViewMode(newMode);
        }
    };

    const renderEditor = () => (
        <TextField
            placeholder="# Start writing markdown..."
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
                    fontFamily: theme.typography.fontFamilyMono,
                    fontSize: `${fontSize}px`,
                    lineHeight: 1.6,
                },
            }}
        />
    );

    const renderPreview = () => (
        <Box
            sx={{
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
                    borderLeft: 3,
                    borderColor: 'primary.main',
                    pl: 2,
                    ml: 0,
                    color: 'text.secondary',
                    fontStyle: 'italic',
                },
                '& a': {
                    color: 'primary.main',
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            ) : (
                <Box sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                    Nothing to preview yet...
                </Box>
            )}
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: '1 0 auto' }}>
            {/* Mode toggle — the same slim, sticky, left-aligned strip as the
                rich-text toolbar, so every page type has one toolbar line. */}
            {!readOnly && (
                <Box
                    role="toolbar"
                    aria-label="Markdown view"
                    data-editor-toolbar
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        display: 'flex',
                        alignItems: 'center',
                        py: '4px',
                        mb: '16px',
                        borderBottom: 1,
                        borderColor: 'divider',
                        bgcolor: surfaces(theme).elevated,
                    }}
                >
                    <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        onChange={handleViewModeChange}
                        size="small"
                        sx={{
                            '& .MuiToggleButton-root': {
                                border: 0,
                                borderRadius: '4px !important',
                                px: '10px',
                                py: '4px',
                                gap: '6px',
                                fontFamily: theme.typography.fontFamilyMono,
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: 'text.secondary',
                                [theme.breakpoints.down('md')]: { minHeight: 44, minWidth: 44 },
                                '&.Mui-selected': {
                                    color: stampInk(theme).ink,
                                    bgcolor: stampFill(theme, stampInk(theme).ink),
                                },
                                '& svg': { fontSize: 16 },
                            },
                        }}
                    >
                        <ToggleButton value="edit" aria-label="edit mode">
                            <Edit fontSize="small" />
                            Edit
                        </ToggleButton>
                        {!isMobile && (
                            <ToggleButton value="split" aria-label="split mode">
                                <VerticalSplit fontSize="small" />
                                Split
                            </ToggleButton>
                        )}
                        <ToggleButton value="preview" aria-label="preview mode">
                            <Visibility fontSize="small" />
                            Preview
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Box>
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

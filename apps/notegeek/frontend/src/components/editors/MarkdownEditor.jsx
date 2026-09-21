import React, { useState } from 'react';
import {
    Box,
    Button,
    CircularProgress,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    useMediaQuery,
    useTheme,
} from '@mui/material';
// Deep-import (see RichTextEditor.jsx for why) instead of the
// '@mui/icons-material' barrel.
import Edit from '@mui/icons-material/Edit';
import Visibility from '@mui/icons-material/Visibility';
import VerticalSplit from '@mui/icons-material/VerticalSplit';
import AutoFixHigh from '@mui/icons-material/AutoFixHigh';
import { useMutation } from '@apollo/client';
import { useToast } from '@geeksuite/ui';
import ReactMarkdown from 'react-markdown';
// See NoteViewer: the preview and the viewer must agree about what markdown
// is, or the editor shows something the saved note will not.
import remarkGfm from 'remark-gfm';
import { surfaces } from '../../theme/tokens';
import { TIDY_MARKDOWN } from '../../graphql/mutations';

/**
 * MarkdownEditor - Lightweight markdown editor with live preview and AI Tidy
 * Uses react-markdown for rendering
 * Three modes: edit, preview, split (desktop only)
 */
function MarkdownEditor({ content = '', setContent, isLoading, readOnly = false, fontSize = 14 }) {
    const theme = useTheme();
    const isMobile = useMediaQuery('(max-width:600px)');
    const [viewMode, setViewMode] = useState(readOnly ? 'preview' : 'edit');
    const { notify } = useToast();
    const [tidyMarkdownMutation, { loading: isTidying }] = useMutation(TIDY_MARKDOWN);
    // On mobile, only allow edit or preview (no split)
    const handleViewModeChange = (event, newMode) => {
        if (newMode !== null) {
            setViewMode(newMode);
        }
    };

    const handleTidy = async () => {
        if (!content || !content.trim() || isTidying) return;
        const previousContent = content;

        try {
            const { data } = await tidyMarkdownMutation({
                variables: { content: previousContent },
            });
            const formatted = data?.tidyMarkdown?.formatted;
            const provenance = data?.tidyMarkdown?.provenance;
            const reason = provenance?.reason;

            // A FALLBACK IS A FAILURE. `source: 'fallback'` means no model
            // answered — a timeout, a provider 400, a quota refusal — and the
            // server handed back the original note. That used to land in the
            // "already clean" branch below (the text is identical, after
            // all), so a dead provider was reported as "Note is already in
            // clean, structured markdown". Saying nothing happened is fine;
            // claiming the note was inspected and approved is not.
            const isFallback = provenance?.source === 'fallback';

            // The server REFUSED, and says why. Both of these mean "your note
            // is unchanged", which is the whole point — a tidy that cannot
            // complete must leave the note alone rather than write back what
            // it managed.
            if (reason === 'content_too_long') {
                notify(
                    'This note is too long to tidy in one pass, so it was left unchanged.',
                    { tone: 'warning', duration: 6000 }
                );
                return;
            }
            if (reason === 'result_too_short') {
                notify(
                    'Tidy came back missing part of the note, so it was discarded. Nothing changed.',
                    { tone: 'warning', duration: 6000 }
                );
                return;
            }

            // Normalised comparison, not exact equality. This guard used to be
            // `formatted.trim() === previousContent.trim()`, which an LLM
            // response essentially never satisfies — so "already clean" was
            // dead code and every Tidy replaced the note, including notes that
            // needed nothing done to them. Collapsing runs of whitespace is
            // enough to recognise a result that is the same text.
            const sameText = (a, b) =>
                a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

            if (isFallback) {
                notify('Tidy is unavailable right now — your note is unchanged.', {
                    tone: 'warning',
                    duration: 6000,
                });
                return;
            }

            if (!formatted || sameText(formatted, previousContent)) {
                notify('Note is already in clean, structured markdown.', { tone: 'info' });
                return;
            }

            setContent(formatted);

            notify('Tidied into clean markdown', {
                tone: 'success',
                duration: 9000,
                action: (
                    <Button
                        size="small"
                        color="inherit"
                        variant="outlined"
                        onClick={() => {
                            setContent(previousContent);
                            notify('Reverted to original note', { tone: 'info', duration: 3000 });
                        }}
                        sx={{
                            fontSize: '0.75rem',
                            py: 0.25,
                            px: 1,
                            textTransform: 'none',
                            borderColor: 'currentColor',
                        }}
                    >
                        Revert
                    </Button>
                ),
            });
        } catch (err) {
            notify(err?.message || 'Failed to tidy markdown note', { tone: 'error' });
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
                height: '100%',
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
                '& .MuiInputBase-root': {
                    height: '100%',
                    alignItems: 'flex-start',
                    overflow: 'auto',
                    p: { xs: 1.5, sm: 2 },
                },
                '& .MuiInputBase-input': {
                    fontFamily: '"Roboto Mono", monospace',
                    fontSize: `${fontSize}px`,
                    lineHeight: 1.6,
                },
            }}
        />
    );

    const renderPreview = () => (
        <Box
            sx={{
                p: { xs: 1.5, sm: 2 },
                height: '100%',
                overflow: 'auto',
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
                    fontFamily: '"Roboto Mono", monospace',
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
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Mode toggle and tidy toolbar */}
            {!readOnly && (
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        p: 1,
                        px: { xs: 1, sm: 2 },
                        borderBottom: 1,
                        borderColor: 'divider',
                        bgcolor: surfaces(theme).paper,
                        gap: 1,
                    }}
                >
                    <Box sx={{ display: { xs: 'none', sm: 'block' }, width: { sm: 100 } }} />

                    <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        onChange={handleViewModeChange}
                        size="small"
                    >
                        <ToggleButton value="edit" aria-label="edit mode">
                            <Edit fontSize="small" sx={{ mr: 0.5 }} />
                            Edit
                        </ToggleButton>
                        {!isMobile && (
                            <ToggleButton value="split" aria-label="split mode">
                                <VerticalSplit fontSize="small" sx={{ mr: 0.5 }} />
                                Split
                            </ToggleButton>
                        )}
                        <ToggleButton value="preview" aria-label="preview mode">
                            <Visibility fontSize="small" sx={{ mr: 0.5 }} />
                            Preview
                        </ToggleButton>
                    </ToggleButtonGroup>

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', width: { xs: 'auto', sm: 100 } }}>
                        <Tooltip title="Tidy Markdown (clean up into proper, easily readable markdown)">
                            <span>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    color="primary"
                                    disabled={isLoading || isTidying || !content || !content.trim()}
                                    onClick={handleTidy}
                                    startIcon={isTidying ? <CircularProgress size={14} color="inherit" /> : <AutoFixHigh fontSize="small" />}
                                    sx={{
                                        textTransform: 'none',
                                        minHeight: 30,
                                        px: 1,
                                        fontSize: '0.8125rem',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {isTidying ? 'Tidying...' : 'Tidy'}
                                </Button>
                            </span>
                        </Tooltip>
                    </Box>
                </Box>
            )}

            {/* Content area */}
            <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex' }}>
                {viewMode === 'edit' && (
                    <Box sx={{ width: '100%', height: '100%' }}>
                        {renderEditor()}
                    </Box>
                )}

                {viewMode === 'preview' && (
                    <Box sx={{ width: '100%', height: '100%' }}>
                        {renderPreview()}
                    </Box>
                )}

                {viewMode === 'split' && (
                    <>
                        <Box sx={{ width: '50%', height: '100%', borderRight: 1, borderColor: 'divider' }}>
                            {renderEditor()}
                        </Box>
                        <Box sx={{ width: '50%', height: '100%' }}>
                            {renderPreview()}
                        </Box>
                    </>
                )}
            </Box>

        </Box>
    );
}

export default MarkdownEditor;

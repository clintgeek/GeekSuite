import React, { useState } from 'react';
import { Box, TextField, ToggleButton, ToggleButtonGroup, useMediaQuery } from '@mui/material';
import { Edit, Visibility, VerticalSplit } from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';

/**
 * MarkdownEditor - Lightweight markdown editor with live preview
 * Uses react-markdown (already installed) for rendering
 * Three modes: edit, preview, split (desktop only)
 */
function MarkdownEditor({ content = '', setContent, isLoading, readOnly = false, fontSize = 14 }) {
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
                height: '100%',
                '& .MuiInputBase-root': {
                    height: '100%',
                    alignItems: 'flex-start',
                    p: { xs: 1.5, sm: 2 },
                },
                '& .MuiInputBase-input': {
                    fontFamily: '"Roboto Mono", monospace',
                    fontSize: `${fontSize}px`,
                    lineHeight: 1.6,
                    height: '100% !important',
                    overflow: 'auto !important',
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
                <ReactMarkdown>{content}</ReactMarkdown>
            ) : (
                <Box sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                    Nothing to preview yet...
                </Box>
            )}
        </Box>
    );

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Mode toggle toolbar */}
            {!readOnly && (
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        p: 1,
                        borderBottom: 1,
                        borderColor: 'divider',
                        bgcolor: 'background.default',
                    }}
                >
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
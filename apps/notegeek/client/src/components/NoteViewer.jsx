import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    Paper,
    Typography,
    Alert,
    Box,
    IconButton,
    Tooltip,
    Button,
    useTheme,
    alpha,
    Fade,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import useNoteStore from '../store/noteStore';
import LockIcon from '@mui/icons-material/Lock';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import {
    TextFields as TextIcon,
    Description as MarkdownIcon,
    Code as CodeIcon,
} from '@mui/icons-material';
import DeleteNoteDialog from './DeleteNoteDialog';

// Note type configuration
const NOTE_TYPE_CONFIG = {
    text: { icon: TextIcon, color: '#5B50A8', darkColor: '#A99DF0', label: 'Text' },
    markdown: { icon: MarkdownIcon, color: '#7B5DAE', darkColor: '#B89BD8', label: 'Markdown' },
    code: { icon: CodeIcon, color: '#4A8C6F', darkColor: '#7DB99A', label: 'Code' },
};

function NoteViewer() {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const {
        selectedNote,
        pendingNote,
        isLoadingSelected,
        selectedError,
        deleteNote
    } = useNoteStore();

    const noteToView = selectedNote || pendingNote;
    const navigate = useNavigate();

    const handleEdit = () => {
        if (noteToView) {
            navigate(`/notes/${noteToView._id}/edit`);
        }
    };

    const handleDeleteClick = () => {
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!noteToView) return;
        const success = await deleteNote(noteToView._id);
        if (success) {
            navigate('/');
        }
    };

    const handleUnlock = () => {
        alert('Unlock functionality not implemented yet.');
    };

    if (isLoadingSelected) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <Typography color="text.secondary">Loading note...</Typography>
            </Box>
        );
    }

    if (selectedError && !noteToView?.content) {
        return (
            <Alert
                severity="warning"
                sx={{ borderRadius: 2 }}
                action={noteToView?.isLocked && (
                    <Button size="small" onClick={handleUnlock}>
                        Unlock
                    </Button>
                )}
            >
                {selectedError}
            </Alert>
        );
    }

    if (!noteToView) {
        return (
            <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography color="text.secondary">Note not found or not selected.</Typography>
            </Box>
        );
    }

    const noteType = noteToView.type || 'text';
    const typeConfig = NOTE_TYPE_CONFIG[noteType] || NOTE_TYPE_CONFIG.text;
    const TypeIcon = typeConfig.icon;
    const typeColor = isDark ? typeConfig.darkColor : typeConfig.color;

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString(undefined, {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <Fade in timeout={300}>
            <Box sx={{ maxWidth: 720, mx: 'auto', py: { xs: 2, sm: 3 } }}>
                {/* Action bar — receded, a tool not a feature */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mb: 1.5,
                        px: 0.5,
                    }}
                >
                    <IconButton
                        onClick={() => navigate('/notes')}
                        size="small"
                        sx={{
                            color: 'text.disabled',
                            borderRadius: 1.5,
                            transition: 'color 100ms ease',
                            '&:hover': { color: 'text.primary' },
                        }}
                    >
                        <ArrowBackIcon sx={{ fontSize: 18 }} />
                    </IconButton>

                    <Typography
                        sx={{
                            fontSize: '0.625rem',
                            fontWeight: 600,
                            color: typeColor,
                            bgcolor: alpha(typeColor, 0.08),
                            px: 0.625,
                            py: 0.125,
                            borderRadius: 0.5,
                        }}
                    >
                        {typeConfig.label}
                    </Typography>

                    <Box sx={{ flex: 1 }} />

                    <Tooltip title="Edit" arrow>
                        <IconButton
                            onClick={handleEdit}
                            size="small"
                            sx={{
                                color: 'primary.main',
                                borderRadius: 1.5,
                                transition: 'all 120ms ease',
                                '&:hover': { bgcolor: theme.palette.glow.soft },
                                '&:focus-visible': { boxShadow: `0 0 0 3px ${theme.palette.glow.ring}` },
                            }}
                        >
                            <EditIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Delete" arrow>
                        <IconButton
                            onClick={handleDeleteClick}
                            size="small"
                            sx={{
                                color: 'text.disabled',
                                borderRadius: 1.5,
                                transition: 'all 120ms ease',
                                '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.06) },
                            }}
                        >
                            <DeleteIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                </Box>

                {/* The reading room — you've entered a space */}
                <Paper
                    elevation={0}
                    sx={{
                        borderRadius: 2.5,
                        overflow: 'hidden',
                        border: `1px solid ${theme.palette.divider}`,
                        display: 'flex',
                    }}
                >
                    {/* Left accent — type identity, same spatial language as Continue */}
                    <Box sx={{ width: 3, bgcolor: typeColor, flexShrink: 0 }} />

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* Title zone — generous, prominent. This is where your eyes land. */}
                        <Box sx={{ px: { xs: 2.5, sm: 3.5 }, pt: { xs: 3, sm: 4 }, pb: 2 }}>
                            <Typography
                                variant="h3"
                                component="h1"
                                sx={{
                                    fontWeight: 700,
                                    fontSize: { xs: '1.375rem', sm: '1.625rem' },
                                    color: 'text.primary',
                                    lineHeight: 1.2,
                                    letterSpacing: '-0.02em',
                                    mb: 1.25,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                }}
                            >
                                {noteToView.title || 'Untitled Note'}
                                {noteToView.isLocked && (
                                    <LockIcon sx={{ color: 'warning.main', fontSize: 20 }} />
                                )}
                            </Typography>

                            {/* Meta — quiet, subordinate */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography sx={{ fontSize: '0.6875rem', color: 'text.disabled', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <AccessTimeIcon sx={{ fontSize: 12 }} />
                                    {formatDate(noteToView.updatedAt || noteToView.createdAt)}
                                </Typography>
                                {noteToView.tags && noteToView.tags.length > 0 && (
                                    <>
                                        <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            {noteToView.tags.map(tag => (
                                                <Typography
                                                    key={tag}
                                                    component="span"
                                                    onClick={() => navigate(`/tags/${encodeURIComponent(tag)}`)}
                                                    sx={{
                                                        fontSize: '0.625rem',
                                                        color: 'text.disabled',
                                                        cursor: 'pointer',
                                                        transition: 'color 100ms ease',
                                                        '&:hover': { color: 'primary.main' },
                                                    }}
                                                >
                                                    {tag}
                                                </Typography>
                                            ))}
                                        </Box>
                                    </>
                                )}
                            </Box>
                        </Box>

                        {/* Divider */}
                        <Box sx={{ mx: { xs: 2.5, sm: 3.5 }, height: '1px', bgcolor: alpha(theme.palette.divider, 0.4) }} />

                        {/* Content — reading space, generous breathing room */}
                        <Box
                            sx={{
                                px: { xs: 2.5, sm: 3.5 },
                                py: { xs: 2.5, sm: 3 },
                                lineHeight: 1.85,
                                fontSize: { xs: '0.9375rem', sm: '1rem' },
                                color: 'text.primary',
                                letterSpacing: '0.01em',
                                '& p': { mb: 2 },
                                '& h1': {
                                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                                    fontWeight: 700,
                                    fontSize: '1.75rem',
                                    mt: 4,
                                    mb: 1.5,
                                    lineHeight: 1.2,
                                },
                                '& h2': {
                                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                                    fontWeight: 600,
                                    fontSize: '1.4rem',
                                    mt: 3.5,
                                    mb: 1.5,
                                    lineHeight: 1.25,
                                },
                                '& h3': {
                                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                                    fontWeight: 700,
                                    fontSize: '1.15rem',
                                    mt: 3,
                                    mb: 1,
                                    lineHeight: 1.3,
                                },
                                '& h4, & h5, & h6': {
                                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                                    fontWeight: 700,
                                    fontSize: '1rem',
                                    mt: 2.5,
                                    mb: 1,
                                },
                                '& a': {
                                    color: 'primary.main',
                                    textDecoration: 'none',
                                    borderBottom: `1px solid`,
                                    borderColor: alpha(theme.palette.primary.main, 0.3),
                                    transition: 'border-color 150ms ease',
                                    '&:hover': {
                                        borderColor: 'primary.main',
                                    },
                                },
                                '& code': {
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize: '0.85em',
                                    bgcolor: alpha(theme.palette.text.primary, 0.05),
                                    px: 0.75,
                                    py: 0.25,
                                    borderRadius: 1,
                                    fontWeight: 500,
                                },
                                '& pre': {
                                    fontFamily: '"JetBrains Mono", monospace',
                                    fontSize: '0.825rem',
                                    lineHeight: 1.7,
                                    bgcolor: isDark ? '#23211F' : '#F0EEEB',
                                    border: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
                                    p: 2.5,
                                    borderRadius: 3,
                                    overflow: 'auto',
                                    '& code': {
                                        bgcolor: 'transparent',
                                        p: 0,
                                        fontSize: 'inherit',
                                    },
                                },
                                '& blockquote': {
                                    borderLeft: `3px solid ${typeColor}`,
                                    pl: 2.5,
                                    ml: 0,
                                    my: 2.5,
                                    color: 'text.secondary',
                                    fontStyle: 'italic',
                                    fontSize: '1.05rem',
                                },
                                '& ul, & ol': {
                                    pl: 3,
                                },
                                '& li': {
                                    mb: 0.75,
                                },
                                '& img': {
                                    maxWidth: '100%',
                                    borderRadius: 2,
                                },
                                '& hr': {
                                    border: 'none',
                                    height: 1,
                                    bgcolor: alpha(theme.palette.divider, 0.5),
                                    my: 3,
                                },
                                '& table': {
                                    borderCollapse: 'collapse',
                                    width: '100%',
                                    my: 2,
                                    '& th, & td': {
                                        border: `1px solid ${theme.palette.divider}`,
                                        px: 1.5,
                                        py: 1,
                                        textAlign: 'left',
                                        fontSize: '0.9rem',
                                    },
                                    '& th': {
                                        bgcolor: alpha(theme.palette.text.primary, 0.03),
                                        fontWeight: 600,
                                    },
                                },
                            }}
                        >
                            {noteToView.type === 'markdown' ? (
                                <ReactMarkdown>{noteToView.content || ''}</ReactMarkdown>
                            ) : noteToView.type === 'text' ? (
                                <div
                                    className="rich-text-viewer"
                                    dangerouslySetInnerHTML={{ __html: noteToView.content || '' }}
                                />
                            ) : noteToView.type === 'code' ? (
                                <pre>
                                    <code>{noteToView.content || ''}</code>
                                </pre>
                            ) : (
                                <Typography
                                    component="pre"
                                    sx={{ whiteSpace: 'pre-wrap', m: 0 }}
                                >
                                    {noteToView.content || ''}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </Paper>

                {/* Delete dialog */}
                <DeleteNoteDialog
                    open={deleteDialogOpen}
                    onClose={() => setDeleteDialogOpen(false)}
                    onConfirm={handleDeleteConfirm}
                    noteTitle={noteToView?.title}
                />
            </Box>
        </Fade>
    );
}

export default NoteViewer;
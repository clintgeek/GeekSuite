import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
// GFM is what makes a pipe table a table. Without it react-markdown parses
// only CommonMark, where `| a | b |` is ordinary text and consecutive lines
// fold into one paragraph — which is exactly how a table rendered here: a
// single run of literal pipes. The `& th` / `& td` styling below has been
// waiting for tables it could never receive.
import remarkGfm from 'remark-gfm';
import { MARKDOWN_COMPONENTS, markdownOverflowSx } from './notes/markdownComponents';
import {
    Paper,
    Typography,
    Box,
    IconButton,
    Tooltip,
    useTheme,
    alpha,
    Fade,
} from '@mui/material';
import { GeekEmptyState, GeekErrorState } from '@geeksuite/ui';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@apollo/client';
import { GET_NOTE_BY_ID } from '../graphql/queries';
import LockIcon from '@mui/icons-material/Lock';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import DeleteNoteDialog from './DeleteNoteDialog';
import NotePrintView from './notes/NotePrintView';
import useNotePrint from '../hooks/useNotePrint';
import TypeIcon from './notes/TypeIcon';
import { noteTypeMeta } from './notes/noteTypeMeta';
import { border, glow, surfaces } from '../theme/tokens';
import { decodeCodeNote } from '../utils/previewText';
import { sanitizeNoteHtml } from '../utils/sanitizeNoteHtml';


function NoteViewer() {
    const theme = useTheme();
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const { id } = useParams();
    const navigate = useNavigate();

    const { data, loading: isLoadingSelected, error, refetch } = useQuery(GET_NOTE_BY_ID, {
        variables: { id },
        skip: !id,
        fetchPolicy: 'cache-and-network',
    });

    const noteToView = data?.note;
    // Print / Save as PDF (DOCS/CONTEXT.md §8). Nothing to prepare: the
    // viewer only shows markdown, rich text and code.
    const { print: handlePrint, rootRef: printRootRef } = useNotePrint({
        title: noteToView?.title,
        enabled: Boolean(noteToView),
    });

    const handleEdit = () => {
        if (noteToView) {
            navigate(`/notes/${ noteToView.id || noteToView._id }/edit`);
        }
    };

    const handleDeleteClick = () => {
        setDeleteDialogOpen(true);
    };



    if (isLoadingSelected) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <Typography color="text.secondary">Loading note...</Typography>
            </Box>
        );
    }

    if (error && !noteToView?.content) {
        return <GeekErrorState error={error} onRetry={() => refetch()} />;
    }

    if (!noteToView) {
        return <GeekEmptyState title="Note not found or not selected." />;
    }

    const noteType = noteToView.type || 'text';
    // Use theme tokens — same source of truth as the rest of the app


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
                        aria-label="Back to notes"
                        size="small"
                        sx={{
                            color: 'text.secondary',
                            borderRadius: 1.5,
                            transition: 'color 100ms ease',
                            '&:hover': { color: 'text.primary' },
                        }}
                    >
                        <ArrowBackIcon sx={{ fontSize: 18 }} />
                    </IconButton>

                    {/* The type, quietly: glyph + name, as in the editor's meta line */}
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'text.secondary', fontSize: '0.8125rem' }}>
                        <TypeIcon type={noteType} size={15} aria-hidden role={undefined} aria-label={undefined} />
                        {noteTypeMeta(noteType).label}
                    </Box>

                    <Box sx={{ flex: 1 }} />

                    <Tooltip title="Edit" arrow>
                        <IconButton
                            onClick={handleEdit}
                            size="small"
                            sx={{
                                color: 'primary.main',
                                borderRadius: 1.5,
                                transition: 'all 120ms ease',
                                '&:hover': { bgcolor: glow(theme).soft },
                                '&:focus-visible': { boxShadow: `0 0 0 3px ${ glow(theme).ring }` },
                            }}
                        >
                            <EditIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Print or save as PDF" arrow>
                        <IconButton
                            onClick={handlePrint}
                            aria-label="Print or save as PDF"
                            size="small"
                            sx={{
                                color: 'text.secondary',
                                borderRadius: 1.5,
                                transition: 'all 120ms ease',
                                '&:hover': { color: 'text.primary', bgcolor: glow(theme).soft },
                                '&:focus-visible': { boxShadow: `0 0 0 3px ${ glow(theme).ring }` },
                            }}
                        >
                            <PrintOutlined sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Delete" arrow>
                        <IconButton
                            onClick={handleDeleteClick}
                            size="small"
                            sx={{
                                color: 'text.secondary',
                                borderRadius: 1.5,
                                transition: 'all 120ms ease',
                                '&:hover': { color: 'error.main', bgcolor: alpha(theme.palette.error.main, 0.06) },
                            }}
                        >
                            <DeleteIcon sx={{ fontSize: 17 }} />
                        </IconButton>
                    </Tooltip>
                </Box>

                {/* The reading room — the editor-paper surface */}
                <Paper
                    elevation={0}
                    sx={{
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: `1px solid ${border(theme)}`,
                        bgcolor: surfaces(theme).elevated,
                        display: 'flex',
                    }}
                >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* Title zone — generous, prominent. This is where your eyes land. */}
                        <Box sx={{ px: { xs: 2.5, sm: 3.5 }, pt: { xs: 3, sm: 4 }, pb: 2 }}>
                            <Typography
                                variant="h3"
                                component="h1"
                                sx={{
                                    fontWeight: 650,
                                    fontSize: { xs: '1.5rem', sm: '1.75rem' },
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

                            {/* Meta — quiet mono timestamp + tag chips */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <Typography
                                    variant="caption"
                                    sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}
                                >
                                    <AccessTimeIcon sx={{ fontSize: 12 }} />
                                    {formatDate(noteToView.updatedAt || noteToView.createdAt)}
                                </Typography>
                                {noteToView.tags && noteToView.tags.length > 0 && (
                                    <>
                                        <Box sx={{ width: 3, height: 3, borderRadius: '50%', bgcolor: 'text.disabled' }} />
                                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                            {noteToView.tags.map(tag => (
                                                <Typography
                                                    key={tag}
                                                    component="span"
                                                    onClick={() => navigate(`/tags/${encodeURIComponent(tag)}`)}
                                                    sx={{
                                                        px: '10px',
                                                        py: 0.125,
                                                        fontSize: '0.8125rem',
                                                        borderRadius: '999px',
                                                        border: `1px solid ${border(theme)}`,
                                                        color: 'text.secondary',
                                                        cursor: 'pointer',
                                                        lineHeight: '18px',
                                                        transition: 'color 100ms ease, border-color 100ms ease',
                                                        '&:hover': { color: 'text.primary', borderColor: theme.palette.text.primary },
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

                        {/* Locked note notice — no button, no click target */}
                        {noteToView.isLocked && (
                            <Typography
                                variant="body2"
                                sx={{ color: 'text.secondary', px: { xs: 2.5, sm: 3.5 }, pb: 1.5 }}
                            >
                                Locked notes aren&rsquo;t readable yet — this feature is in progress.
                            </Typography>
                        )}

                        {/* Divider */}
                        <Box sx={{ mx: { xs: 2.5, sm: 3.5 }, height: '1px', bgcolor: alpha(theme.palette.divider, 0.4) }} />

                        {/* Content — reading space, generous breathing room */}
                        <Box
                            sx={{
                                ...markdownOverflowSx,
                                px: { xs: 2.5, sm: 3.5 },
                                py: { xs: 2.5, sm: 3 },
                                lineHeight: 1.85,
                                fontSize: { xs: '0.9375rem', sm: '1rem' },
                                color: 'text.primary',
                                letterSpacing: '0.01em',
                                '& p': { mb: 2 },
                                '& h1': {
                                    fontFamily: 'inherit',
                                    fontWeight: 700,
                                    fontSize: '1.75rem',
                                    mt: 4,
                                    mb: 1.5,
                                    lineHeight: 1.2,
                                },
                                '& h2': {
                                    fontFamily: 'inherit',
                                    fontWeight: 600,
                                    fontSize: '1.4rem',
                                    mt: 3.5,
                                    mb: 1.5,
                                    lineHeight: 1.25,
                                },
                                '& h3': {
                                    fontFamily: 'inherit',
                                    fontWeight: 700,
                                    fontSize: '1.15rem',
                                    mt: 3,
                                    mb: 1,
                                    lineHeight: 1.3,
                                },
                                '& h4, & h5, & h6': {
                                    fontFamily: 'inherit',
                                    fontWeight: 700,
                                    fontSize: '1rem',
                                    mt: 2.5,
                                    mb: 1,
                                },
                                '& a': {
                                    color: 'text.primary',
                                    textDecoration: 'none',
                                    borderBottom: `1px solid`,
                                    borderColor: border(theme),
                                    transition: 'border-color 150ms ease',
                                    '&:hover': {
                                        borderColor: 'primary.main',
                                    },
                                },
                                '& code': {
                                    fontFamily: 'var(--ng-mono)',
                                    fontSize: '0.85em',
                                    bgcolor: alpha(theme.palette.text.primary, 0.05),
                                    px: 0.75,
                                    py: 0.25,
                                    borderRadius: 1,
                                    fontWeight: 500,
                                },
                                '& pre': {
                                    fontFamily: 'var(--ng-mono)',
                                    fontSize: '0.825rem',
                                    lineHeight: 1.7,
                                    bgcolor: theme.palette.background.default,
                                    border: `1px solid ${theme.palette.divider}`,
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
                                    borderLeft: `2px solid ${ border(theme) }`,
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
                                        border: `1px solid ${ theme.palette.divider }`,
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
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{noteToView.content || ''}</ReactMarkdown>
                            ) : noteToView.type === 'text' ? (
                                // Stored TipTap HTML. It is rendered as
                                // markup, so it is sanitized here — the one
                                // `dangerouslySetInnerHTML` in the app, behind
                                // the one profile (utils/sanitizeNoteHtml.js).
                                // The gateway sanitizes the same string on
                                // save; this is the layer that has to hold,
                                // because rows written before that existed are
                                // still in the database.
                                <div
                                    className="rich-text-viewer"
                                    dangerouslySetInnerHTML={{ __html: sanitizeNoteHtml(noteToView.content) }}
                                />
                            ) : noteToView.type === 'code' ? (
                                // The stored value is CodeEditor's
                                // `{ language, code }` envelope; printing it
                                // raw showed the reader the JSON rather than
                                // their code. See utils/previewText.js.
                                <pre role="region" aria-label="Code" tabIndex={0}>
                                    <code>{decodeCodeNote(noteToView.content || '').code}</code>
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

                <NotePrintView note={noteToView} rootRef={printRootRef} />

                {/* Delete dialog */}
                <DeleteNoteDialog
                    open={deleteDialogOpen}
                    onClose={() => setDeleteDialogOpen(false)}
                    noteId={noteToView?.id || noteToView?._id}
                    noteTitle={noteToView?.title}
                />
            </Box>
        </Fade>
    );
}

export default NoteViewer;
import React from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    Stack,
    Typography,
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * ComposeDialog — see the composed document before anything is written.
 *
 * Compose is lossy by design: merging, reordering and dropping is the job. So
 * unlike Tidy it can never write straight back over the source, which may be
 * the only copy of material pasted in from a chat or an email. The result is
 * shown, and the user decides.
 *
 * `Save as a new note` is the primary action and the safe path. `Replace this
 * note` exists because the incremental workflow needs it — paste new scraps
 * into a composed note, compose again, replace — and it is safe now only
 * because every note carries version history: a replace is one entry in that
 * history and is undoable from the History panel.
 *
 * The stats line is not decoration. `chunksFailed` means a batch of the source
 * never made it into a document that otherwise looks complete, and the user
 * has to know that BEFORE choosing what to do with it.
 */
export default function ComposeDialog({
    open,
    onClose,
    loading,
    markdown,
    stats,
    error,
    onSaveAsNew,
    onReplace,
}) {
    const failed = stats?.chunksFailed || 0;
    const hasResult = Boolean(markdown && markdown.trim());

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ pb: 1 }}>
                Composed document
                {stats ? (
                    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                        <Chip size="small" label={`${stats.fragments} fragments`} />
                        <Chip
                            size="small"
                            label={stats.strategy === 'single' ? 'one pass' : `${stats.chunks} batches`}
                        />
                        {failed > 0 ? (
                            <Chip size="small" color="warning" label={`${failed} batch${failed === 1 ? '' : 'es'} failed`} />
                        ) : null}
                    </Stack>
                ) : null}
            </DialogTitle>

            <DialogContent dividers>
                {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}>
                        <CircularProgress size={20} />
                        <Typography variant="body2" color="text.secondary">
                            Reading the scraps and building a document…
                        </Typography>
                    </Box>
                ) : null}

                {!loading && error ? <Alert severity="error">{error}</Alert> : null}

                {/* Said before the document, not after: it changes what the
                    document means. */}
                {!loading && !error && failed > 0 ? (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {failed} batch{failed === 1 ? '' : 'es'} of your material could not be read, so
                        {failed === 1 ? ' it is' : ' they are'} missing from this document. The original
                        note is untouched.
                    </Alert>
                ) : null}

                {!loading && !error && hasResult ? (
                    <Box
                        sx={{
                            '& h1': { fontSize: '1.6rem', mt: 2, mb: 1 },
                            '& h2': { fontSize: '1.3rem', mt: 2, mb: 1 },
                            '& h3': { fontSize: '1.1rem', mt: 1.5, mb: 0.75 },
                            '& p': { mb: 1.5, lineHeight: 1.6 },
                            '& ul, & ol': { pl: 3, mb: 1.5 },
                            '& table': { borderCollapse: 'collapse', width: '100%', mb: 2 },
                            '& th, & td': { border: 1, borderColor: 'divider', p: 1, textAlign: 'left' },
                            '& th': { bgcolor: 'action.hover', fontWeight: 600 },
                            '& pre': { bgcolor: 'action.hover', p: 1.5, borderRadius: 1, overflow: 'auto' },
                        }}
                    >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
                    </Box>
                ) : null}

                {!loading && !error && !hasResult ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        Nothing came back. Your note is unchanged.
                    </Typography>
                ) : null}
            </DialogContent>

            <Divider />
            <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
                <Button onClick={onClose} sx={{ textTransform: 'none' }}>
                    Discard
                </Button>
                <Box sx={{ flex: 1 }} />
                {/* Replace is deliberately the secondary action and sits left
                    of the primary, so the muscle-memory click is the safe one. */}
                <Button
                    onClick={onReplace}
                    disabled={!hasResult || loading}
                    color="inherit"
                    sx={{ textTransform: 'none' }}
                >
                    Replace this note
                </Button>
                <Button
                    onClick={onSaveAsNew}
                    disabled={!hasResult || loading}
                    variant="contained"
                    sx={{ textTransform: 'none' }}
                >
                    Save as a new note
                </Button>
            </DialogActions>
        </Dialog>
    );
}

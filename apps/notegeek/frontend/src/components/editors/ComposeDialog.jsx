import React, { useEffect, useState } from 'react';
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
import { MARKDOWN_COMPONENTS, markdownOverflowSx } from '../notes/markdownComponents';

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
 * has to know that BEFORE choosing what to do with it. `truncated` means the
 * document stops mid-thought, which is the same class of problem.
 *
 * The model's name is shown for a reason learned on 2026-09-22: a compose
 * routed to a 7B row returned one sentence repeated thirty-eight times, and
 * nothing on screen said which model had produced it. The gateway refuses a
 * looping answer outright now, but "which model wrote this" is the first
 * question anyone asks about a disappointing result, and the answer belongs
 * next to the result.
 *
 * Compose from several notes (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md U3, U5)
 * uses the same dialog, switched on by `sourceCount`: the status line counts
 * the notes and the seconds, `skippedSummary` names the notes left out, the
 * warnings speak of "your notes", there is no Replace (no single source), and
 * after the save `offer` turns the dialog into "Saved. Archive the 4 source
 * notes?". Without those props it is exactly the single-note dialog.
 */
export default function ComposeDialog({
    open,
    onClose,
    loading,
    markdown,
    stats,
    error,
    model,
    onSaveAsNew,
    // Optional. Without it there is no "Replace this note": the
    // handwriting path (DOCS/HANDWRITING.md §2) only ever makes a new note,
    // because the sketch it came from is the original.
    onReplace,
    discardLabel = 'Discard',
    // ── Compose from several notes ─────────────────────────────────────
    // How many notes went in; switches on the many-notes wording.
    sourceCount,
    // "2 notes left out: Garden plan (locked), Sketch 4 (a sketch)".
    skippedSummary,
    // The new note is being written.
    saving = false,
    // After the save: { count, onArchive, onKeep, busy }.
    offer,
}) {
    const failed = stats?.chunksFailed || 0;
    const hasResult = Boolean(markdown && markdown.trim());
    const truncated = Boolean(stats?.truncated);
    const many = Boolean(sourceCount);
    const untouched = many ? 'Your notes are untouched.' : 'The original note is untouched.';

    // Elapsed seconds while a many-notes compose runs: several notes can take
    // a while, and a spinner alone looks the same at 3 s and at 60.
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        if (!many || !loading) return undefined;
        setElapsed(0);
        const started = Date.now();
        const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(t);
    }, [many, loading]);

    if (offer) {
        const n = offer.count;
        return (
            <Dialog open={open} onClose={offer.busy ? undefined : offer.onKeep} maxWidth="sm" fullWidth aria-labelledby="compose-offer-title">
                <DialogTitle id="compose-offer-title" sx={{ pb: 1 }}>
                    Saved. Archive the {n} source note{n === 1 ? '' : 's'}?
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary">
                        Archived notes leave your lists, tags and search. They keep their history, and
                        Archived brings them back any time.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
                    <Box sx={{ flex: 1 }} />
                    <Button onClick={offer.onKeep} disabled={offer.busy} color="inherit" sx={{ textTransform: 'none', minHeight: 44 }}>
                        Keep them
                    </Button>
                    <Button onClick={offer.onArchive} disabled={offer.busy} variant="contained" sx={{ textTransform: 'none', minHeight: 44 }}>
                        Archive them
                    </Button>
                </DialogActions>
            </Dialog>
        );
    }

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
                        {model ? (
                            <Chip size="small" variant="outlined" label={model} sx={{ fontFamily: '"Roboto Mono", monospace' }} />
                        ) : null}
                    </Stack>
                ) : null}
            </DialogTitle>

            {/* A long draft scrolls here, so a keyboard has to be able to reach
                it (axe scrollable-region-focusable, harness 20b). Many-notes
                mode only, so the single-note dialog stays exactly as it was. */}
            <DialogContent
                dividers
                {...(many ? { tabIndex: 0, role: 'region', 'aria-label': 'Composed document' } : null)}
            >
                {loading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 4, justifyContent: 'center' }}>
                        <CircularProgress size={20} />
                        <Typography variant="body2" color="text.secondary" role={many ? 'status' : undefined}>
                            {many
                                ? `Composing ${sourceCount} notes… ${elapsed}s`
                                : 'Reading the scraps and building a document…'}
                        </Typography>
                    </Box>
                ) : null}

                {!loading && error ? <Alert severity="error">{error}</Alert> : null}

                {/* Said before the document, not after: it changes what the
                    document means. */}
                {!loading && !error && failed > 0 ? (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {many ? (
                            <>Some material could not be read — check before relying on it. {failed} batch{failed === 1 ? '' : 'es'} of
                            your notes {failed === 1 ? 'is' : 'are'} missing from this document. {untouched}</>
                        ) : (
                            <>{failed} batch{failed === 1 ? '' : 'es'} of your material could not be read, so
                            {failed === 1 ? ' it is' : ' they are'} missing from this document. The original
                            note is untouched.</>
                        )}
                    </Alert>
                ) : null}

                {!loading && !error && truncated ? (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        The model ran out of room before it finished, so this document stops
                        mid-thought. {untouched}
                    </Alert>
                ) : null}

                {!loading && skippedSummary ? (
                    <Alert severity="info" sx={{ mb: 2 }} data-compose-skipped="">
                        {skippedSummary}
                    </Alert>
                ) : null}

                {!loading && !error && hasResult ? (
                    <Box
                        sx={{
                            ...markdownOverflowSx,
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
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
                    </Box>
                ) : null}

                {!loading && !error && !hasResult ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                        {many ? 'Nothing came back. Your notes are unchanged.' : 'Nothing came back. Your note is unchanged.'}
                    </Typography>
                ) : null}
            </DialogContent>

            <Divider />
            <DialogActions sx={{ px: 2, py: 1.5, gap: 1, flexWrap: 'wrap' }}>
                <Button onClick={onClose} disabled={saving} sx={{ textTransform: 'none', ...(many ? { minHeight: 44 } : null) }}>
                    {discardLabel}
                </Button>
                <Box sx={{ flex: 1 }} />
                {/* Replace is deliberately the secondary action and sits left
                    of the primary, so the muscle-memory click is the safe one. */}
                {onReplace ? (
                    <Button
                        onClick={onReplace}
                        disabled={!hasResult || loading}
                        color="inherit"
                        sx={{ textTransform: 'none' }}
                    >
                        Replace this note
                    </Button>
                ) : null}
                <Button
                    onClick={onSaveAsNew}
                    disabled={!hasResult || loading || saving}
                    variant="contained"
                    sx={{ textTransform: 'none', ...(many ? { minHeight: 44 } : null) }}
                >
                    {saving ? 'Saving…' : 'Save as a new note'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

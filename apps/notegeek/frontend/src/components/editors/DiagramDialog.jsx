import React, { useId } from 'react';
import {
    Alert,
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    TextField,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';
import { TOUCH_TARGET_MEDIA } from '../../hooks/useNoteFormFactor';
import MermaidBlock from '../notes/MermaidBlock';

/**
 * DiagramDialog — the review step of "Turn into a diagram"
 * (DOCS/HANDWRITING.md). Shaped like TranscribeDialog, the convert flow's
 * review: the drawn diagram, its Mermaid source to correct (redrawn after a
 * pause in typing; the last good drawing stays meanwhile), and the page it
 * came from. Discard, or Save as new note. A diagram Mermaid cannot draw
 * shows why, and offers Save anyway so it can be fixed by hand later.
 *
 * Stages: `working` (`step`: export / read / check), `error` (Try again),
 * `review`.
 */
export default function DiagramDialog({
    open,
    stage,
    step,
    source,
    onSourceChange,
    parseError,
    onDrawn,
    error,
    model,
    imageUrl,
    saving = false,
    onClose,
    onRetry,
    onSave,
}) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const titleId = useId();
    const mono = { fontFamily: theme.typography.fontFamilyMono, wordSpacing: 'normal' };
    const reviewing = stage === 'review';
    const hasSource = Boolean(source && source.trim());
    const button = { textTransform: 'none', [TOUCH_TARGET_MEDIA]: { minHeight: 44 } };
    const workingLabel = step === 'export'
        ? 'Turning the page into an image…'
        : step === 'check' ? 'Checking the diagram…' : 'Reading the diagram…';

    return (
        <Dialog
            open={open}
            onClose={saving ? undefined : onClose}
            fullScreen={phone}
            maxWidth="lg"
            fullWidth
            aria-labelledby={titleId}
            data-diagram-dialog=""
        >
            <DialogTitle id={titleId} sx={{ pb: 1 }}>
                Handwriting to diagram
                <Typography
                    variant="caption"
                    component="p"
                    title={reviewing && model ? `Drawn by ${model}` : undefined}
                    sx={{ ...mono, color: 'text.secondary', letterSpacing: '0.04em', mt: 1 }}
                >
                    {reviewing ? 'An approximation · check it against the page' : 'The handwriting stays as it is'}
                </Typography>
            </DialogTitle>

            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', minHeight: { md: 420 } }}>
                {stage === 'working' ? (
                    <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 3, py: 8, justifyContent: 'center' }}>
                        <CircularProgress size={20} />
                        <Typography variant="body2" color="text.secondary">{workingLabel}</Typography>
                    </Box>
                ) : null}

                {stage === 'error' ? (
                    <Alert
                        severity="error"
                        action={onRetry ? (
                            <Button color="inherit" size="small" onClick={onRetry} sx={button}>Try again</Button>
                        ) : null}
                    >
                        {error}
                    </Alert>
                ) : null}

                {reviewing ? (
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 4,
                            alignContent: 'start',
                            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
                        }}
                    >
                        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <Box
                                data-diagram-drawing=""
                                sx={{ minWidth: 0 }}
                            >
                                <MermaidBlock source={source} keepLastGood sourceToggle={false} onResult={onDrawn} />
                            </Box>
                            {parseError ? (
                                <Alert severity="warning" role="status" data-diagram-problem="">
                                    Mermaid can&apos;t draw this yet: {parseError} Fix the source, or save it anyway and fix it later.
                                </Alert>
                            ) : null}
                            {imageUrl && !phone ? <PageImage url={imageUrl} mono={mono} /> : null}
                        </Box>
                        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <TextField
                                label="Mermaid source"
                                value={source}
                                onChange={(e) => onSourceChange(e.target.value)}
                                multiline
                                minRows={phone ? 8 : 16}
                                fullWidth
                                disabled={saving}
                                helperText="Fix any label it misread. [?] marks a word it couldn't read."
                                inputProps={{ spellCheck: false, 'data-diagram-source': '' }}
                                InputProps={{ sx: { ...mono, fontSize: '0.875rem', lineHeight: 1.6, alignItems: 'flex-start' } }}
                                FormHelperTextProps={{ sx: { ...mono, fontSize: '0.75rem', mx: 0 } }}
                            />
                            {imageUrl && phone ? <PageImage url={imageUrl} mono={mono} /> : null}
                        </Box>
                    </Box>
                ) : null}
            </DialogContent>

            <Divider />
            <DialogActions sx={{ px: 4, py: 3, gap: 2, flexWrap: 'wrap' }}>
                <Button onClick={onClose} disabled={saving} sx={button}>
                    Discard
                </Button>
                <Box sx={{ flex: 1 }} />
                {reviewing && parseError ? (
                    <Button onClick={onSave} disabled={!hasSource || saving} color="inherit" variant="outlined" sx={button}>
                        Save anyway
                    </Button>
                ) : (
                    <Button onClick={onSave} disabled={!reviewing || !hasSource || saving} variant="contained" sx={button}>
                        Save as new note
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

function PageImage({ url, mono }) {
    return (
        <Box component="figure" sx={{ m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box
                component="img"
                src={url}
                alt="The handwritten page that was read"
                sx={{
                    width: '100%',
                    maxHeight: { xs: '28vh', md: 360 },
                    objectFit: 'contain',
                    // The export is white-backed; frame it as a sheet.
                    bgcolor: '#ffffff',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 1,
                }}
            />
            <Typography component="figcaption" variant="caption" sx={{ ...mono, color: 'text.secondary' }}>
                What the model saw
            </Typography>
        </Box>
    );
}

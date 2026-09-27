import React, { useId } from 'react';
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
    TextField,
    Typography,
    useMediaQuery,
    useTheme,
} from '@mui/material';

/**
 * TranscribeDialog — the review step of "Convert handwriting to text"
 * (DOCS/HANDWRITING.md §2, step 4).
 *
 * A transcript is an approximation, so nothing happens to it until the
 * writer has read it against the page and fixed what the model misread. The
 * page is shown beside the text for exactly that: correcting a word needs the
 * word it was meant to be. From here the text goes to Compose, or is kept as
 * it is; either way it becomes a NEW note. There is no "replace" here, and the
 * sketch is never touched.
 *
 * Stages: `working` (exporting / reading, `step` says which), `error`
 * (with Retry), `review` (the editable box).
 */
export default function TranscribeDialog({
    open,
    stage,
    step,
    text,
    onTextChange,
    error,
    model,
    imageUrl,
    saving = false,
    onClose,
    onRetry,
    onCompose,
    onKeepPlain,
}) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const titleId = useId();
    const mono = { fontFamily: theme.typography.fontFamilyMono };
    const hasText = Boolean(text && text.trim());
    const reviewing = stage === 'review';
    const button = { textTransform: 'none', [theme.breakpoints.down('md')]: { minHeight: 44 } };

    return (
        <Dialog
            open={open}
            onClose={saving ? undefined : onClose}
            fullScreen={phone}
            maxWidth="lg"
            fullWidth
            aria-labelledby={titleId}
        >
            <DialogTitle id={titleId} sx={{ pb: 1 }}>
                Handwriting to text
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" component="p" sx={{ ...mono, color: 'text.secondary', letterSpacing: '0.04em' }}>
                        {reviewing ? 'An approximation · check it against the page' : 'The sketch stays as it is'}
                    </Typography>
                    {reviewing && model ? (
                        <Chip size="small" variant="outlined" label={model} sx={mono} />
                    ) : null}
                </Box>
            </DialogTitle>

            <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', minHeight: { md: 420 } }}>
                {stage === 'working' ? (
                    <Box
                        role="status"
                        sx={{ display: 'flex', alignItems: 'center', gap: 3, py: 8, justifyContent: 'center' }}
                    >
                        <CircularProgress size={20} />
                        <Typography variant="body2" color="text.secondary">
                            {step === 'export' ? 'Turning the page into an image…' : 'Reading the handwriting…'}
                        </Typography>
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
                        // No flex/minHeight squeeze here: on a phone the two
                        // rows stack and the dialog content scrolls. Squeezed,
                        // the image's caption ran into the Transcript label.
                        sx={{
                            display: 'grid',
                            gap: 4,
                            alignContent: 'start',
                            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' },
                        }}
                    >
                        {imageUrl ? (
                            <Box
                                component="figure"
                                sx={{ m: 0, display: 'flex', flexDirection: 'column', gap: 1 }}
                            >
                                <Box
                                    component="img"
                                    src={imageUrl}
                                    alt="The sketch page that was read"
                                    sx={{
                                        width: '100%',
                                        maxHeight: { xs: '28vh', md: 520 },
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
                        ) : null}
                        <TextField
                            label="Transcript"
                            value={text}
                            onChange={(e) => onTextChange(e.target.value)}
                            multiline
                            minRows={phone ? 8 : 14}
                            fullWidth
                            autoFocus={!phone}
                            disabled={saving}
                            helperText="Fix any word it misread. [?] marks a word it couldn't read."
                            InputProps={{ sx: { fontSize: '0.9375rem', lineHeight: 1.6, alignItems: 'flex-start' } }}
                            FormHelperTextProps={{ sx: { ...mono, fontSize: '0.75rem', mx: 0 } }}
                        />
                    </Box>
                ) : null}
            </DialogContent>

            <Divider />
            <DialogActions sx={{ px: 4, py: 3, gap: 2, flexWrap: 'wrap' }}>
                <Button onClick={onClose} disabled={saving} sx={button}>
                    Discard
                </Button>
                <Box sx={{ flex: 1 }} />
                <Button
                    onClick={onKeepPlain}
                    disabled={!reviewing || !hasText || saving}
                    color="inherit"
                    variant="outlined"
                    sx={button}
                >
                    Keep as plain text
                </Button>
                <Button
                    onClick={onCompose}
                    disabled={!reviewing || !hasText || saving}
                    variant="contained"
                    sx={button}
                >
                    Compose it
                </Button>
            </DialogActions>
        </Dialog>
    );
}

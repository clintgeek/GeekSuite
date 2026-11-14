import React, { useId } from 'react';
import {
    Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { KIND, summarize } from '../../utils/journalLines';

/**
 * SendTasksDialog — a sketch's journal lines, on their way to TodoGeek
 * (DOCS/BUJO_HANDWRITING.md).
 *
 * The page read as a bullet journal: each line that opens with a journal mark
 * is a row. Open things arrive ticked; done, notes and already-moved lines
 * arrive unticked. The words are editable (the reading is an approximation),
 * and the line under each row says what TodoGeek's own grammar understood in
 * them — the same `/friday`, `!high`, `#tag` the add box reads.
 *
 * Nothing is sent until "Send to TodoGeek". The sketch is never changed.
 *
 * `rows`: [{ key, kind, text, on, sent, unsure }]
 */
export default function SendTasksDialog({
    open,
    stage, // 'working' | 'review' | 'error' | 'done'
    rows = [],
    error = null,
    sending = false,
    result = null, // { sent, failed, todoGeekUrl }
    onToggle,
    onTextChange,
    onSend,
    onClose,
    onRetry,
}) {
    const theme = useTheme();
    const phone = useMediaQuery(theme.breakpoints.down('sm'));
    const titleId = useId();
    const mono = { fontFamily: theme.typography.fontFamilyMono, wordSpacing: 'normal' };
    const button = { textTransform: 'none', [theme.breakpoints.down('md')]: { minHeight: 44 } };
    const chosen = rows.filter((r) => r.on && r.text.trim());

    return (
        <Dialog open={open} onClose={sending ? undefined : onClose} fullScreen={phone} maxWidth="md" fullWidth aria-labelledby={titleId}>
            <DialogTitle id={titleId} sx={{ pb: 1 }}>
                Send tasks to TodoGeek
                <Typography variant="caption" component="p" sx={{ ...mono, color: 'text.secondary', letterSpacing: '0.04em', mt: 1 }}>
                    {stage === 'done'
                        ? 'The sketch is unchanged'
                        : 'Journal lines from this page · the sketch stays as it is'}
                </Typography>
            </DialogTitle>

            <DialogContent dividers sx={{ minHeight: { md: 320 } }}>
                {stage === 'working' ? (
                    <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 3, py: 8, justifyContent: 'center' }}>
                        <CircularProgress size={20} />
                        <Typography variant="body2" color="text.secondary">Reading the handwriting…</Typography>
                    </Box>
                ) : null}

                {stage === 'error' ? (
                    <Alert
                        severity="error"
                        action={onRetry ? <Button color="inherit" size="small" onClick={onRetry} sx={button}>Try again</Button> : null}
                    >
                        {error || 'Could not read the page.'}
                    </Alert>
                ) : null}

                {stage === 'done' && result ? (
                    <Box role="status" sx={{ py: 4 }}>
                        <Typography variant="body1" sx={{ mb: 2 }}>
                            {result.sent === 1 ? '1 entry was added to TodoGeek.' : `${result.sent} entries were added to TodoGeek.`}
                        </Typography>
                        {result.failed ? (
                            <Alert severity="warning" sx={{ mb: 3 }}>
                                {result.failed === 1 ? '1 entry was not added.' : `${result.failed} entries were not added.`} They are still ticked: send again to retry.
                            </Alert>
                        ) : null}
                        {result.todoGeekUrl ? (
                            <Button href={result.todoGeekUrl} target="_blank" rel="noopener" variant="outlined" sx={button}>
                                Open TodoGeek
                            </Button>
                        ) : null}
                    </Box>
                ) : null}

                {stage === 'review' && rows.length === 0 ? (
                    <Box sx={{ py: 4 }}>
                        <Typography variant="body1" sx={{ mb: 2 }}>No journal lines on this page.</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Start a line with a mark and it shows up here:
                        </Typography>
                        <Typography component="pre" variant="body2" sx={{ ...mono, color: 'text.secondary', m: 0, whiteSpace: 'pre-wrap' }}>
                            {'•  a task          ○  an event\n☐  a task          –  a note\n×  done            !  important     ?  a question'}
                        </Typography>
                    </Box>
                ) : null}

                {stage === 'review' && rows.length > 0 ? (
                    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {rows.map((row) => {
                            const label = `${KIND[row.kind]?.label || 'Task'}: ${row.text}`;
                            return (
                                <Box component="li" key={row.key} sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                                    <Checkbox
                                        checked={row.on}
                                        onChange={(e) => onToggle(row.key, e.target.checked)}
                                        disabled={sending}
                                        inputProps={{ 'aria-label': `Send — ${label}` }}
                                        sx={{ mt: 0.5 }}
                                    />
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 1 }}>
                                            <Chip size="small" variant="outlined" label={KIND[row.kind]?.label || 'Task'} sx={mono} />
                                            {row.sent ? <Chip size="small" label="Already sent" sx={mono} /> : null}
                                            {row.unsure ? <Chip size="small" color="warning" variant="outlined" label="Check the [?]" sx={mono} /> : null}
                                        </Box>
                                        <TextField
                                            value={row.text}
                                            onChange={(e) => onTextChange(row.key, e.target.value)}
                                            disabled={sending}
                                            fullWidth
                                            size="small"
                                            multiline
                                            inputProps={{ 'aria-label': `Words — ${label}` }}
                                            helperText={summarize(row.text)}
                                            FormHelperTextProps={{ sx: { ...mono, fontSize: '0.75rem', mx: 0 } }}
                                        />
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>
                ) : null}
            </DialogContent>

            <Divider />
            <DialogActions sx={{ px: 4, py: 3, gap: 2, flexWrap: 'wrap' }}>
                <Button onClick={onClose} disabled={sending} sx={button}>
                    {stage === 'done' ? 'Close' : 'Cancel'}
                </Button>
                <Box sx={{ flex: 1 }} />
                {stage === 'review' && rows.length > 0 ? (
                    <Button onClick={onSend} disabled={sending || chosen.length === 0} variant="contained" sx={button}>
                        {sending ? 'Sending…' : chosen.length === 1 ? 'Send 1 to TodoGeek' : `Send ${chosen.length} to TodoGeek`}
                    </Button>
                ) : null}
            </DialogActions>
        </Dialog>
    );
}

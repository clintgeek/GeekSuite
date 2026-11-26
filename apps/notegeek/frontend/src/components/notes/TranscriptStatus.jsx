import React, { useId, useState } from 'react';
import {
  Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Popover, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';

/**
 * TranscriptStatus — a sketch's automatic transcription, as quietly as the
 * save stamp beside it (DOCS/AUTO_TRANSCRIBE_SPEC.md §7): waiting,
 * transcribing, searchable, needs retry. No toasts, no dialogs of its own
 * accord. It says where the page goes ("via OpenRouter") whenever something
 * is or was sent.
 *
 * Tappable (review 2.11): the detail used to live in a tooltip, which a touch
 * screen only shows on a long-press, and "needs retry" had no way to retry.
 * A tap opens the detail with **Transcribe now** (when the page can be read
 * again) and **View text** (the reading itself, without going through Convert).
 *
 * Not a second `role="status"` — SaveStatus is the page's one live region.
 *
 * `view.tooLong` (set by useAutoTranscribe from the export): the page is so
 * tall that its handwriting is shrunk past what a model reads well (2.7).
 */
const LABELS = {
  waiting: { label: 'waiting to transcribe', tip: 'About 90 seconds after you stop writing, the page is sent to OpenRouter to read the handwriting.' },
  transcribing: { label: 'transcribing via OpenRouter', tip: 'The page is being read so its handwriting becomes searchable.' },
  searchable: { label: 'searchable' },
  retry: { label: 'transcription: needs retry' },
  failed: { label: 'transcription: needs retry' },
};

/** Statuses from which "Transcribe now" makes sense. */
const CAN_READ_NOW = new Set(['waiting', 'retry', 'failed']);

export const TOO_LONG_NOTE = 'This page is long: its writing is shrunk to fit one image, and the model may misread it. A second note keeps each page legible.';

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function transcriptStatusText(view) {
  if (!view || (!view.autoEnabled && view.status !== 'searchable')) return null;
  const entry = LABELS[view.status];
  if (!entry) return null; // empty, off
  let tip = entry.tip;
  if (view.status === 'searchable') {
    tip = view.edited || view.source === 'user'
      ? 'Searchable by its handwriting, with your corrections.'
      // The model id is not on the screen (review 2026-11-18 #6); it is the
      // detail's tooltip (`model` below). "via OpenRouter" stays: it says
      // where the page went (spec §7).
      : `Searchable by its handwriting · read via OpenRouter${view.at ? ` · ${when(view.at)}` : ''}`;
  } else if (view.status === 'retry') {
    tip = `${view.error || 'The last attempt did not finish.'} ${view.retryAt ? `It will try again after ${when(view.retryAt)}.` : 'It will try again.'}`;
  } else if (view.status === 'failed') {
    tip = `${view.error || 'This page could not be read.'} It will try again after the next change; Convert still works.`;
  }
  const model = view.status === 'searchable' && !(view.edited || view.source === 'user') && view.model
    ? `Read by ${view.model}` : undefined;
  return { label: entry.label, tip, model };
}

export default function TranscriptStatus({ view, onTranscribeNow = null }) {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState(null);
  const [showText, setShowText] = useState(false);
  const [copied, setCopied] = useState(false);
  const detailId = useId();
  const textTitleId = useId();
  const text = transcriptStatusText(view);
  if (!text) return null;

  const canReadNow = Boolean(onTranscribeNow) && CAN_READ_NOW.has(view.status);
  const hasText = typeof view.text === 'string' && view.text.trim() !== '';
  const mono = { fontFamily: theme.typography.fontFamilyMono, wordSpacing: 'normal' };
  const button = { textTransform: 'none', minHeight: 44 };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(view.text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <ButtonBase
        component="span"
        data-transcript-status={view.status}
        aria-label={`Handwriting: ${text.label}${view.tooLong ? ', page too long to read well' : ''}. Details`}
        aria-haspopup="dialog"
        aria-expanded={anchor ? 'true' : 'false'}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{
          ...mono,
          fontSize: '0.75rem',
          lineHeight: 1.3,
          color: 'text.secondary',
          whiteSpace: 'nowrap',
          borderRadius: 1,
          // A small target in a dense row: the hit area grows, the text doesn't.
          // 44px tall whatever the line's own height (it was inset -12px on a
          // 16px line: 40px, under the phone floor).
          position: 'relative',
          '&::after': { content: '""', position: 'absolute', left: -4, right: -4, top: '50%', height: 44, transform: 'translateY(-50%)' },
          // A no-break space: ButtonBase is a flex box, and a flex item's
          // trailing plain space is dropped ("1d ago ·searchable").
          '&::before': { content: '"·\\00a0"' },
          '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
        }}
      >
        {text.label}
        {view.tooLong ? <Box component="span" sx={{ color: 'warning.main' }}>{' · page too long to read well'}</Box> : null}
      </ButtonBase>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-labelledby': detailId, sx: { p: 3, maxWidth: 360 } } }}
      >
        <Typography id={detailId} variant="body2" title={text.model} sx={{ mb: 2 }}>{text.tip}</Typography>
        {view.tooLong ? <Typography variant="body2" sx={{ mb: 2, color: 'warning.main' }}>{TOO_LONG_NOTE}</Typography> : null}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {canReadNow ? (
            <Button variant="outlined" sx={button} onClick={() => { setAnchor(null); onTranscribeNow(); }}>
              Transcribe now
            </Button>
          ) : null}
          {hasText ? (
            <Button sx={button} onClick={() => { setAnchor(null); setCopied(false); setShowText(true); }}>
              View text
            </Button>
          ) : null}
        </Box>
      </Popover>

      <Dialog open={showText && hasText} onClose={() => setShowText(false)} fullScreen={phone} maxWidth="sm" fullWidth aria-labelledby={textTitleId}>
        <DialogTitle id={textTitleId} sx={{ pb: 1 }}>
          The handwriting, as read
          <Typography variant="caption" component="p" sx={{ ...mono, color: 'text.secondary', mt: 1 }}>
            {view.edited || view.source === 'user' ? 'With your corrections' : 'An approximation · Convert turns it into a note'}
          </Typography>
        </DialogTitle>
        <DialogContent dividers>
          <Typography component="pre" variant="body2" sx={{ ...mono, m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {view.text}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 4, py: 3, gap: 2 }}>
          <Typography role="status" variant="caption" sx={{ ...mono, color: 'text.secondary', mr: 'auto' }}>
            {copied ? 'Copied' : ''}
          </Typography>
          <Button onClick={copy} sx={button}>Copy</Button>
          <Button onClick={() => setShowText(false)} variant="contained" sx={button}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

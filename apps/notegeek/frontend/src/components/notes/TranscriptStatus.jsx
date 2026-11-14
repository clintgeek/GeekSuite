import React from 'react';
import { Box, Tooltip, useTheme } from '@mui/material';

/**
 * TranscriptStatus — a sketch's automatic transcription, as quietly as the
 * save stamp beside it (DOCS/AUTO_TRANSCRIBE_SPEC.md §7): waiting,
 * transcribing, searchable, needs retry. No toasts, no dialogs. It says
 * where the page goes ("via OpenRouter") whenever something is or was sent.
 *
 * Not a second `role="status"` — SaveStatus is the page's one live region —
 * so it is plain text with a tooltip for the detail.
 */
const LABELS = {
  waiting: { label: 'waiting to transcribe', tip: 'About 90 seconds after you stop writing, the page is sent to OpenRouter to read the handwriting.' },
  transcribing: { label: 'transcribing via OpenRouter', tip: 'The page is being read so its handwriting becomes searchable.' },
  searchable: { label: 'searchable' },
  retry: { label: 'transcription: needs retry' },
  failed: { label: 'transcription: needs retry' },
};

function when(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function transcriptStatusText(view) {
  if (!view || (!view.autoEnabled && view.status !== 'searchable')) return null;
  const entry = LABELS[view.status];
  if (!entry) return null; // empty, off
  let tip = entry.tip;
  if (view.status === 'searchable') {
    tip = view.edited || view.source === 'user'
      ? 'Searchable by its handwriting, with your corrections.'
      : `Searchable by its handwriting · read by ${view.model || 'a vision model'} via OpenRouter${view.at ? ` · ${when(view.at)}` : ''}`;
  } else if (view.status === 'retry') {
    tip = `${view.error || 'The last attempt did not finish.'} ${view.retryAt ? `It will try again after ${when(view.retryAt)}.` : 'It will try again.'}`;
  } else if (view.status === 'failed') {
    tip = `${view.error || 'This page could not be read.'} It will try again after the next change; Convert still works.`;
  }
  return { label: entry.label, tip };
}

export default function TranscriptStatus({ view }) {
  const theme = useTheme();
  const text = transcriptStatusText(view);
  if (!text) return null;
  return (
    <Tooltip title={text.tip} placement="bottom-start">
      <Box
        component="span"
        data-transcript-status={view.status}
        tabIndex={0}
        aria-label={`Handwriting: ${text.label}. ${text.tip}`}
        sx={{
          fontFamily: theme.typography.fontFamilyMono,
          wordSpacing: 'normal',
          fontSize: '0.75rem',
          lineHeight: 1.3,
          color: 'text.secondary',
          whiteSpace: 'nowrap',
          '&::before': { content: '"· "' },
        }}
      >
        {text.label}
      </Box>
    </Tooltip>
  );
}

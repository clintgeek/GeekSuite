/**
 * The quiet "due in 12 days" / "overdue" line under a thing, from its
 * `nextDue`. Only overdue, soon (≤30 d) and upcoming (≤90 d) speak up; a date
 * next spring is not news on a card. The dot and the words share the status
 * tone, walked to AA on the surface they sit on.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { readableOn } from '@geeksuite/ui';
import { dueText } from '../utils/dates';
import { dateKindLabel } from '../utils/vocab';

const LOUD = new Set(['overdue', 'soon', 'upcoming']);

export function statusTone(theme, status, surface) {
  const tone = theme.palette.status?.[status] ?? theme.palette.text.secondary;
  return readableOn(tone, surface ?? theme.palette.background.card ?? theme.palette.background.paper);
}

export function dueSummary(nextDue) {
  if (!nextDue) return '';
  const what = nextDue.label || dateKindLabel(nextDue.kind);
  return `${dueText(nextDue.daysUntil)} · ${what}`;
}

export default function DueLine({ nextDue, always = false, surface, sx }) {
  const theme = useTheme();
  if (!nextDue || (!always && !LOUD.has(nextDue.status))) return null;
  const color = statusTone(theme, nextDue.status, surface);
  return (
    <Box
      component="span"
      data-testid="due-line"
      sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, fontSize: '0.75rem', fontWeight: 600, color, ...sx }}
    >
      <Box component="span" aria-hidden="true" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {dueSummary(nextDue)}
      </Box>
    </Box>
  );
}

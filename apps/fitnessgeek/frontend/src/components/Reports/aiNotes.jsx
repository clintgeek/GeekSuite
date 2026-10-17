import React from 'react';
import { Typography } from '@mui/material';

/**
 * "Notes from the AI" — the one name for every AI-written panel (UX review
 * 2026-10-17, D-11). Reports and the Home card used four "coach" names
 * between them, and no panel said what it was written from, when, or that
 * it can be wrong. These helpers say all three, the same way everywhere.
 */

export const AI_NOTES_NAME = 'Notes from the AI';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The title a range of days gets: "This week" / "Last 14 days" / "Last 30 days". */
export function aiNotesTitle(days) {
  const n = Number(days);
  if (n === 7) return 'This week';
  return `Last ${n} days`;
}

/** "from your last 7 days of logs" — the default source for an N-day panel. */
export function lastDaysSource(days) {
  const n = Number(days);
  if (n === 1) return 'from your last day of logs';
  return `from your last ${n} days of logs`;
}

/**
 * When it was written: "9:40 am" today, "Oct 16, 9:40 pm" on another day.
 * Panels are cached for hours, so an evening note can still be up next
 * morning — and then the time alone would be a fib.
 */
export function writtenAt(generatedAt, now = new Date()) {
  if (!generatedAt) return null;
  const d = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  return sameDay ? time : `${MONTHS[d.getMonth()]} ${d.getDate()}, ${time}`;
}

/**
 * "Written by AI from your last 7 days of logs · 9:40 am · It can be wrong —
 * check the numbers above."
 */
export function aiFooterText({ source, generatedAt, now } = {}) {
  const when = writtenAt(generatedAt, now);
  return [
    `Written by AI ${source}`,
    when,
    'It can be wrong — check the numbers above.',
  ].filter(Boolean).join(' · ');
}

/** The footer line every AI panel ends with. */
export function AINoteFooter({ source, generatedAt, sx }) {
  return (
    <Typography
      data-testid="ai-note-footer"
      sx={{ color: 'text.secondary', fontSize: '0.75rem', lineHeight: 1.5, mt: 1.5, ...sx }}
    >
      {aiFooterText({ source, generatedAt })}
    </Typography>
  );
}

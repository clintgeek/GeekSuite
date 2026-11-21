/**
 * The masthead. Today's front page (the default) gets the whole thing: a
 * heavy rule, the nameplate, the paper's patch, then the dateline between
 * hairlines. The date is America/Chicago ("Saturday, October 10, 2026"),
 * whatever zone the phone is in. With `updatedAt` (Today's generatedAt) the
 * edition says when the paper was set: "Today's paper · Updated 8:05 AM",
 * so a stale page reads as stale.
 *
 * `compact` (Everything and the section pages; UX review 2026-11-18,
 * finding 1 — the nameplate is the front page's alone): one dateline row,
 * no nameplate, no county line, no edition. The top bar already names the
 * page, so the page's h1 (`title`) is for screen readers only and never
 * printed twice (finding 7). The date shortens on a phone so the row holds.
 *
 * `aside` sits at the right end of the dateline (the Free to read switch,
 * folded into the row instead of a row of its own); `note` is a quiet line
 * under it ("14 paywalled stories hidden").
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { GOTHIC, SERIF, flagSx, visuallyHiddenSx } from '../theme/theme';
import { clockTime, mastheadDate, shortMastheadDate } from '../utils/dates';
import { useResumeTick } from '../hooks/useResumeTick';

const dateSx = { fontFamily: SERIF, fontStyle: 'italic', fontSize: '1rem', color: 'text.primary' };
const noteSx = { fontFamily: GOTHIC, fontStyle: 'italic', fontSize: '0.8125rem', color: 'text.secondary', textAlign: 'right', pb: 1 };

function Note({ note }) {
  if (!note) return null;
  return <Box sx={noteSx}>{note}</Box>;
}

export default function Masthead({ now, edition = 'Today’s paper', updatedAt = null, compact = false, title = null, aside = null, note = null }) {
  // The dateline is re-read when the PWA comes back (a paper left open overnight).
  useResumeTick();
  const day = now ?? new Date();
  const date = mastheadDate(day);
  const updated = clockTime(updatedAt);

  if (compact) {
    return (
      <Box component="header" data-testid="dateline" sx={{ pt: 1, borderBottom: 1, borderColor: 'divider' }}>
        {title ? (
          <Typography component="h1" sx={visuallyHiddenSx}>
            {title}
          </Typography>
        ) : null}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: 3, minHeight: 44 }}>
          <Typography component="p" data-testid="masthead-date" sx={{ ...dateSx, minWidth: 0 }}>
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              {date}
            </Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
              {shortMastheadDate(day)}
            </Box>
          </Typography>
          {aside}
        </Box>
        <Note note={note} />
      </Box>
    );
  }

  return (
    <Box component="header" sx={{ textAlign: 'center', pt: 4, pb: 0 }}>
      <Box sx={{ borderTop: 4, borderColor: 'text.primary', pt: 3 }} />
      <Typography
        component="h1"
        sx={{
          fontFamily: SERIF,
          fontWeight: 800,
          fontSize: { xs: '2.75rem', sm: '3.5rem', md: '4rem' },
          lineHeight: 1,
          letterSpacing: '-0.025em',
          color: 'text.primary',
        }}
      >
        NewsGeek
      </Typography>
      <Typography component="p" sx={{ ...flagSx, color: 'text.secondary', mt: 2 }}>
        Clark &amp; Hot Spring Counties · Arkansas
      </Typography>
      <Box
        sx={{
          mt: 3,
          py: aside ? 0.5 : 2,
          borderTop: 1,
          borderBottom: 1,
          borderColor: 'text.primary',
          textAlign: 'left',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 4, rowGap: 0 }}>
          <Typography component="p" data-testid="masthead-date" sx={{ ...dateSx, py: aside ? 1 : 0 }}>
            {date}
          </Typography>
          <Box sx={{ flex: aside ? '1 1 260px' : '0 1 auto', display: 'flex', alignItems: 'center', justifyContent: aside ? 'space-between' : 'flex-end', columnGap: 3 }}>
            <Typography component="p" sx={{ ...flagSx, color: 'text.secondary' }}>
              {edition}
              {updated ? (
                <Box component="span" data-testid="masthead-updated">
                  {` · Updated ${updated}`}
                </Box>
              ) : null}
            </Typography>
            {aside}
          </Box>
        </Box>
        <Note note={note} />
      </Box>
    </Box>
  );
}

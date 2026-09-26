/**
 * Dates as a timeline: warranty ends, registration and insurance renewals,
 * maintenance. Each carries the server's status (overdue / soon ≤30 d /
 * upcoming ≤90 d / later) as a coloured node on the rail and in words — the
 * colour is never the only signal.
 */
import React from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import { EventRepeat as RepeatIcon } from '@mui/icons-material';
import Section from './Section';
import { statusTone } from '../../components/DueLine';
import { dueDateOf, formatCalendarDate, recurText, relativeDay } from '../../utils/dates';
import { dateKindLabel } from '../../utils/vocab';

export function sortDates(dates = []) {
  return [...dates].sort((a, b) => new Date(dueDateOf(a)) - new Date(dueDateOf(b)));
}

export default function DatesSection({ dates = [], onEdit }) {
  const theme = useTheme();
  const surface = theme.palette.background.card;
  const rows = sortDates(dates);

  return (
    <Section
      id="dates"
      title="Dates"
      action={
        <Button size="small" onClick={onEdit} sx={{ color: 'text.primary', fontWeight: 600 }}>
          {rows.length ? 'Edit' : 'Add a date'}
        </Button>
      }
    >
      {rows.length ? (
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0, position: 'relative' }}>
          {rows.map((d, i) => {
            const tone = statusTone(theme, d.status, surface);
            const last = i === rows.length - 1;
            return (
              <Box component="li" key={d.id} data-testid="date-row" data-status={d.status} sx={{ position: 'relative', display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr)', columnGap: 1.25, pb: last ? 0 : 1.75 }}>
                <Box aria-hidden="true" sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                  {!last ? <Box sx={{ position: 'absolute', top: 14, bottom: -6, width: 2, bgcolor: 'divider', borderRadius: 1 }} /> : null}
                  <Box sx={{ mt: '5px', width: 12, height: 12, borderRadius: '50%', bgcolor: d.status === 'later' ? 'transparent' : tone, border: 2, borderColor: tone, position: 'relative' }} />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', color: 'text.primary' }}>
                      {d.label || dateKindLabel(d.kind)}
                    </Typography>
                    <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, color: tone, letterSpacing: '0.02em' }}>
                      {relativeDay(d.daysUntil)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {d.recurEveryMonths ? 'Next ' : ''}
                    {formatCalendarDate(dueDateOf(d), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    {d.label ? ` · ${dateKindLabel(d.kind)}` : ''}
                  </Typography>
                  {d.recurEveryMonths ? (
                    <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
                      <RepeatIcon aria-hidden="true" sx={{ fontSize: 14 }} />
                      {recurText(d.recurEveryMonths)}, counting from {formatCalendarDate(d.date)}
                    </Typography>
                  ) : null}
                  {d.notes ? <Typography sx={{ fontSize: '0.8125rem', color: 'text.primary', mt: 0.5, whiteSpace: 'pre-wrap' }}>{d.notes}</Typography> : null}
                </Box>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          Warranty ends, registrations and service intervals show up here — and in Needs attention when they're close.
        </Typography>
      )}
    </Section>
  );
}

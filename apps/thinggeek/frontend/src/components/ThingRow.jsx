/**
 * One thing in the list view — built for scanning a column of values and due
 * dates: a small photo, the name and what/where, then (sm+) Value and Next
 * due in their own right-aligned columns. On a phone the two figures drop to
 * a second line under the name.
 */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import DueLine from './DueLine';
import ThingPhoto from './ThingPhoto';
import { coverSrc, thingMetaLine, thingValueText } from './thingDisplay';
import { dueDateOf, formatCalendarDate } from '../utils/dates';

export const ROW_COLUMNS = { xs: '52px minmax(0, 1fr)', sm: '52px minmax(0, 1fr) 112px 200px' };

export function ListHeader() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: { xs: 'none', sm: 'grid' },
        gridTemplateColumns: ROW_COLUMNS,
        gap: 1.5,
        px: 1,
        pb: 0.75,
        borderBottom: 1,
        borderColor: 'divider',
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'text.secondary',
      }}
    >
      <span />
      <span>Thing</span>
      <Box component="span" sx={{ textAlign: 'right' }}>Value</Box>
      <span>Next due</span>
    </Box>
  );
}

export default function ThingRow({ thing, onOpen }) {
  const name = thing.name || 'Untitled';
  const meta = thingMetaLine(thing);
  const value = thingValueText(thing);
  const due = thing.nextDue;

  return (
    <Box component="li" data-testid="thing-row" sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider' }}>
      <ButtonBase
        onClick={() => onOpen?.(thing)}
        aria-label={meta ? `${name}, ${meta}` : name}
        sx={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: ROW_COLUMNS,
          alignItems: 'center',
          gap: 1.5,
          px: 1,
          py: 1,
          textAlign: 'left',
          borderRadius: '8px',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} variant="thumb" radius={6} />
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" noWrap sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary' }}>
            {name}
          </Typography>
          <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {meta || ' '}
          </Typography>
          <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', gap: 1, minWidth: 0, mt: 0.25 }}>
            {value ? (
              <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.primary', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {value}
              </Typography>
            ) : null}
            <DueLine nextDue={due} />
          </Box>
        </Box>
        <Typography
          component="span"
          sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: value ? 'text.primary' : 'text.muted', fontVariantNumeric: 'tabular-nums' }}
        >
          {value || '—'}
        </Typography>
        <Box sx={{ display: { xs: 'none', sm: 'block' }, minWidth: 0 }}>
          {due ? (
            <>
              <DueLine nextDue={due} always />
              <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary', pl: '15px' }}>
                {formatCalendarDate(dueDateOf(due))}
              </Typography>
            </>
          ) : (
            <Typography component="span" sx={{ fontSize: '0.875rem', color: 'text.muted' }}>—</Typography>
          )}
        </Box>
      </ButtonBase>
    </Box>
  );
}

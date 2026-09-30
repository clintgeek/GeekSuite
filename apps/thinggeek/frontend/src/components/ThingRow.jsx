/**
 * One thing in the list view — the phone's default (Label Maker): dense
 * enough to scan a drawer's worth at a glance.
 *
 *   [photo] Name                                   ●
 *           Type  [GARAGE]
 *
 * The place is a small strip of Dymo tape with the LAST crumb of the path
 * (the full walk is on the thing's page, and in the row's accessible name).
 * The orange dot means it needs attention (overdue or due soon) — the same
 * count the Attention tab carries.
 *
 * sm+: Value and Next due get their own right-aligned columns.
 */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import DueLine, { dueSummary } from './DueLine';
import DymoTape from './DymoTape';
import { toneForKind } from '../theme/theme';
import ThingPhoto from './ThingPhoto';
import { coverSrc, thingValueText } from './thingDisplay';
import { dueDateOf, formatCalendarDate } from '../utils/dates';
import { pathOf, whereLabel } from '../utils/where';

export const ROW_COLUMNS = { xs: '44px minmax(0, 1fr) auto', sm: '52px minmax(0, 1fr) 112px 200px' };

/** Due-date states that count as "needs attention" (the Attention tab's badge). */
export const ATTENTION_STATUSES = new Set(['overdue', 'soon']);
export const needsAttention = (thing) => ATTENTION_STATUSES.has(thing?.nextDue?.status);

/** The orange attention dot: a fill with an ink ring, so it reads on card stock too. */
export function AttentionDot({ sx }) {
  return (
    <Box
      component="span"
      aria-hidden="true"
      data-testid="attention-dot"
      sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: 'safety.main', border: '2px solid', borderColor: 'text.primary', flexShrink: 0, ...sx }}
    />
  );
}

/** The last crumb of where it is, as tape (blue refill for a container) — or nothing when it isn't anywhere yet. */
export function PlaceTape({ thing, size = 'sm', sx }) {
  const path = pathOf(thing);
  const last = path[path.length - 1];
  if (!last) return null;
  return (
    <DymoTape size={size} tone={toneForKind(last.kind)} tilt={false} title={whereLabel(thing)} sx={{ maxWidth: '100%', ...sx }}>
      {last.name}
    </DymoTape>
  );
}

export function ListHeader() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: { xs: 'none', sm: 'grid' },
        gridTemplateColumns: ROW_COLUMNS,
        gap: 1.5,
        px: 1.5,
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
        fontSize: '0.8125rem',
        fontWeight: 600,
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
  const where = whereLabel(thing);
  const value = thingValueText(thing);
  const due = thing.nextDue;
  const attention = needsAttention(thing);
  const label = [name, thing.type?.name, where ? `in ${where}` : null, attention ? dueSummary(due) : null].filter(Boolean).join(', ');

  return (
    <Box component="li" data-testid="thing-row" sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}>
      <ButtonBase
        onClick={() => onOpen?.(thing)}
        aria-label={label}
        sx={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: ROW_COLUMNS,
          alignItems: 'center',
          columnGap: 1.5,
          px: 1.5,
          py: 1,
          minHeight: 60,
          textAlign: 'left',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} variant="thumb" radius={4} />
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" noWrap sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3, color: 'text.primary' }}>
            {name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mt: '3px' }}>
            {thing.type?.name ? (
              <Typography component="span" noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary', flexShrink: 0, maxWidth: '45%' }}>
                {thing.type.name}
              </Typography>
            ) : null}
            <PlaceTape thing={thing} sx={{ minWidth: 0 }} />
          </Box>
        </Box>
        {/* Phone: the dot. sm+: the Value and Next due columns. */}
        <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', justifyContent: 'center', width: 16 }}>{attention ? <AttentionDot /> : null}</Box>
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

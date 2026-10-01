/**
 * One thing in the list view — the phone's default: a line on the yard's
 * inventory, dense enough to scan a drawer's worth at a glance.
 *
 *   [bin] Name                                     ●
 *         Type  [▌Garage]
 *
 * The place is a unit tag with the LAST crumb of the path (the full walk is
 * on the thing's page, in the tag's title and in the row's accessible name).
 * The marker light means it needs attention: red overdue, amber due soon —
 * the same count the Attention tab carries.
 *
 * sm+: Value and Next due get their own right-aligned columns.
 */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import DueLine, { dueSummary } from './DueLine';
import UnitTag from './UnitTag';
import { MarkerLight } from './SectionHeading';
import ThingPhoto from './ThingPhoto';
import { coverSrc, thingValueText } from './thingDisplay';
import { dueDateOf, formatCalendarDate } from '../utils/dates';
import { pathOf, whereLabel } from '../utils/where';

export const ROW_COLUMNS = { xs: '44px minmax(0, 1fr) auto', sm: '52px minmax(0, 1fr) 112px 200px' };

/** Due-date states that count as "needs attention" (the Attention tab's badge). */
export const ATTENTION_STATUSES = new Set(['overdue', 'soon']);
export const needsAttention = (thing) => ATTENTION_STATUSES.has(thing?.nextDue?.status);

/** The attention marker light: red when overdue, amber when due soon, with a black ring. */
export function AttentionDot({ status, sx }) {
  return <MarkerLight testId="attention-dot" tone={status === 'overdue' ? 'overdue' : 'soon'} size={14} sx={sx} />;
}

/** The last crumb of where it is, as a unit tag — or nothing when it isn't anywhere yet. */
export function PlaceLabel({ thing, size = 'sm', sx }) {
  const path = pathOf(thing);
  const last = path[path.length - 1];
  if (!last) return null;
  return (
    <UnitTag kind={last.kind} variant="inline" size={size} title={whereLabel(thing)} sx={{ maxWidth: '100%', ...sx }}>
      {last.name}
    </UnitTag>
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
        <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} variant="thumb" radius={3} />
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" noWrap sx={{ fontSize: '0.9375rem', fontWeight: 700, lineHeight: 1.3, color: 'text.primary' }}>
            {name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, mt: '3px' }}>
            {thing.type?.name ? (
              <Typography component="span" noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary', flexShrink: 0, maxWidth: '45%' }}>
                {thing.type.name}
              </Typography>
            ) : null}
            <PlaceLabel thing={thing} sx={{ minWidth: 0 }} />
          </Box>
        </Box>
        {/* Phone: the dot. sm+: the Value and Next due columns. */}
        <Box sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', justifyContent: 'center', width: 16 }}>{attention ? <AttentionDot status={due?.status} /> : null}</Box>
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

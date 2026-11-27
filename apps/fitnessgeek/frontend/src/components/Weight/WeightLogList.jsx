import React, { useState } from 'react';
import { Box, Button, ButtonBase, Typography } from '@mui/material';
import { MonitorWeight as WeightIcon } from '@mui/icons-material';
import { localDateString, utcDateString } from '@geeksuite/utils';
import { nearDay } from '../../utils/dates.js';
import { LabelPanel, ListRow, Tag, EmptyState } from '../primitives';
import EditWeightDialog from './EditWeightDialog.jsx';

/** Rows shown before "Show all" — the list is a record, not the page. */
export const INITIAL_ROWS = 10;

/**
 * The weight log.
 *
 * No per-row change against the previous entry. It used to print "+1.8 lbs"
 * in red beside a water day — a day-over-day delta, which the smoothing rule
 * (FITNESSGEEK_BODY_DATA_PLAN §0) forbids: it teaches reacting to noise. The
 * trend lives in the chart above, as a 7-day average.
 *
 * A typed value and one the scale imported (`source: 'arboleaf_xlsx'`) can be
 * told apart (F9), but only the EXCEPTIONS are marked: a "Scale" chip on every
 * row of a person whose scale sends every weigh-in said nothing 24 times
 * (round-two review). Whichever way most of her weigh-ins arrive is the
 * usual one and goes unmarked; the odd one out says "Scale" or "Typed in".
 * The edit dialog still says where a scale row came from.
 *
 * THE ROW IS THE BUTTON (review, round three). Each row carried a pencil and
 * a bin, twenty icons on a screen of ten weights. Now the whole row is one
 * button, named "Edit the 218.7 lb weigh-in from Today" for a screen reader
 * and reachable by Tab, Enter and Space; it opens the edit dialog, and Delete
 * is in there. Deleting still goes through the page's `onDelete`, so its
 * "Removed … · Undo" toast is the same.
 */
const isScale = (log) => log?.source === 'arboleaf_xlsx';

/** 'scale' when most weigh-ins came from the scale, else 'typed'. */
export function usualSource(logs) {
  const rows = (Array.isArray(logs) ? logs : []).filter(Boolean);
  const scale = rows.filter(isScale).length;
  return scale * 2 > rows.length ? 'scale' : 'typed';
}

const WeightLogList = ({ logs, onDelete, onUpdate, unit = 'lbs' }) => {
  // A list nobody can change (neither callback) is plain rows.
  const canOpen = Boolean(onUpdate || onDelete);
  // The row being edited outlives the dialog's open flag, so the dialog's
  // closing transition still has its date and value to show.
  const [editing, setEditing] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // `log_date` is a CALENDAR date stored at UTC midnight, not an instant —
  // same class of bug already fixed in BPLogList. Take the calendar-day
  // string with `utcDateString` and compare it with the viewer's own
  // `localDateString` today, never `new Date(log_date).toDateString()`,
  // which is the day before west of UTC. Words per review U-5: "Today",
  // "Yesterday", a weekday for the last week, else "Oct 13" (the year only
  // when it isn't this year).
  const formatDate = (dateString) => nearDay(utcDateString(dateString), localDateString());
  const u = unit === 'lbs' ? 'lb' : unit;

  // A null or dateless row (a partial record) is skipped, not a crash.
  const sortedLogs = (Array.isArray(logs) ? logs : []).filter((l) => l && l.log_date).sort((a, b) => {
    const da = utcDateString(a.log_date);
    const db = utcDateString(b.log_date);
    return da < db ? 1 : da > db ? -1 : 0;
  });

  if (!sortedLogs.length) {
    return (
      <EmptyState
        icon={WeightIcon}
        title="No weigh-ins yet"
        copy="Type today’s weight at the top of this page and tap Log. Every weigh-in is kept here."
      />
    );
  }

  const visible = showAll ? sortedLogs : sortedLogs.slice(0, INITIAL_ROWS);
  const usual = usualSource(sortedLogs);

  return (
    <LabelPanel
      title="Weight log"
      titleComponent="h3"
      action={
        <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
          {sortedLogs.length} {sortedLogs.length === 1 ? 'weigh-in' : 'weigh-ins'}
        </Typography>
      }
    >
      {canOpen && (
        <Typography data-testid="weight-log-hint" sx={{ color: 'text.secondary', fontSize: '0.8125rem', mb: 1 }}>
          Tap a weigh-in to change or delete it.
        </Typography>
      )}
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {visible.map((log, index) => {
          const n = parseFloat(log?.weight_value);
          const weight = Number.isFinite(n) ? n.toFixed(1) : '—';
          const when = formatDate(log.log_date);
          const source = isScale(log) ? 'scale' : 'typed';
          const oddSource = source === usual
            ? null
            : source === 'scale'
              ? { label: 'Scale', title: 'Imported from the scale' }
              : { label: 'Typed in', title: 'Typed in, not from the scale' };
          return (
            <ListRow
              component="li"
              key={log.id}
              first={index === 0}
              data-testid="weight-log-row"
              sx={{ display: 'block', py: 0 }}
            >
              <Box
                {...(canOpen ? {
                  component: ButtonBase,
                  onClick: () => { setEditing(log); setEditOpen(true); },
                  'aria-label': `Edit the ${weight} ${u} weigh-in from ${when}`,
                  'aria-haspopup': 'dialog',
                } : {})}
                sx={{
                  display: 'block',
                  width: '100%',
                  minHeight: 56,
                  py: 2,
                  textAlign: 'left',
                  font: 'inherit',
                  color: 'inherit',
                  borderRadius: 2,
                  ...(canOpen ? {
                    '@media (hover: hover)': { '&:hover': { bgcolor: 'action.hover' } },
                    '&.Mui-focusVisible': { outline: (t) => `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
                  } : {}),
                }}
              >
                <Typography component="span" sx={{ display: 'block', fontWeight: 700, fontSize: '1.0625rem', fontVariantNumeric: 'tabular-nums' }}>
                  {weight}
                  <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}> {u}</Box>
                </Typography>
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                  <Typography component="span" sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>{when}</Typography>
                  {oddSource && (
                    <Box component="span" title={oddSource.title} data-testid="weight-source" sx={{ display: 'inline-flex' }}>
                      <Tag>{oddSource.label}</Tag>
                    </Box>
                  )}
                </Box>
                {log.notes && (
                  <Typography
                    component="span"
                    sx={{ display: 'block', color: 'text.secondary', fontSize: '0.8125rem', mt: 0.25, overflowWrap: 'anywhere' }}
                  >
                    {log.notes}
                  </Typography>
                )}
              </Box>
            </ListRow>
          );
        })}
      </Box>

      {sortedLogs.length > INITIAL_ROWS && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
          <Button onClick={() => setShowAll((v) => !v)} sx={{ minHeight: 44 }}>
            {showAll ? 'Show fewer' : `Show all ${sortedLogs.length}`}
          </Button>
        </Box>
      )}

      {canOpen && (
        <EditWeightDialog
          open={editOpen}
          log={editing}
          unit={unit}
          onClose={() => setEditOpen(false)}
          onSave={onUpdate}
          onDelete={onDelete}
        />
      )}
    </LabelPanel>
  );
};

export default WeightLogList;

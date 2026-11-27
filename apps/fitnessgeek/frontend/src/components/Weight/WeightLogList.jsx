import React, { useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
  MonitorWeight as WeightIcon,
} from '@mui/icons-material';
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
 * Rows the scale imported (`source: 'arboleaf_xlsx'`) carry a "Scale" marker
 * so a typed value and a measured one can be told apart (F9).
 */
const WeightLogList = ({ logs, onDelete, onUpdate, unit = 'lbs' }) => {
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

  const sortedLogs = [...(logs || [])].sort((a, b) => {
    const da = utcDateString(a.log_date);
    const db = utcDateString(b.log_date);
    return da < db ? 1 : da > db ? -1 : 0;
  });

  if (!sortedLogs.length) {
    return (
      <EmptyState
        icon={WeightIcon}
        title="No weigh-ins yet"
        copy="Log a weight with the button below, or import a scale export — scale readings land here on their own."
      />
    );
  }

  const visible = showAll ? sortedLogs : sortedLogs.slice(0, INITIAL_ROWS);

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
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {visible.map((log, index) => {
          const weight = parseFloat(log.weight_value).toFixed(1);
          const when = formatDate(log.log_date);
          const fromScale = log.source === 'arboleaf_xlsx';
          return (
            <ListRow
              component="li"
              key={log.id}
              first={index === 0}
              data-testid="weight-log-row"
              sx={{ gap: 1, py: 0.5 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography component="span" sx={{ fontWeight: 800, fontSize: '1.125rem' }}>
                  {weight}
                  <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 700 }}> {u}</Box>
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>{when}</Typography>
                  {fromScale && (
                    <Box component="span" title="Imported from the scale" sx={{ display: 'inline-flex' }}>
                      <Tag>Scale</Tag>
                    </Box>
                  )}
                </Box>
                {log.notes && (
                  <Typography
                    sx={{ color: 'text.secondary', fontSize: '0.8125rem', mt: 0.25, overflowWrap: 'anywhere' }}
                  >
                    {log.notes}
                  </Typography>
                )}
              </Box>
              {onUpdate && (
                <IconButton
                  onClick={() => { setEditing(log); setEditOpen(true); }}
                  aria-label={`Edit the ${weight} ${u} weigh-in from ${when}`}
                  sx={{ width: 44, height: 44, color: 'text.secondary' }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton
                onClick={() => onDelete(log.id)}
                aria-label={`Remove the ${weight} ${u} weigh-in from ${when}`}
                // Quiet at rest; the error colour only under the thumb (B7).
                sx={{
                  width: 44,
                  height: 44,
                  color: 'text.secondary',
                  '&:hover, &:active': { color: 'error.main', bgcolor: (t) => alpha(t.palette.error.main, 0.08) },
                }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
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

      {onUpdate && (
        <EditWeightDialog
          open={editOpen}
          log={editing}
          unit={unit}
          onClose={() => setEditOpen(false)}
          onSave={onUpdate}
        />
      )}
    </LabelPanel>
  );
};

export default WeightLogList;

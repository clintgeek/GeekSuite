import React, { useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import {
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
  MonitorWeight as WeightIcon,
} from '@mui/icons-material';
import { displayCalendarDate, localDateString, utcDateString } from '@geeksuite/utils';
import { Surface, SectionLabel, StatNumber, EmptyState } from '../primitives';
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
  // same class of bug already fixed in BPLogList. Compare calendar-day
  // strings via `utcDateString`/`localDateString` and render with
  // `displayCalendarDate` (which forces `timeZone: 'UTC'`), never
  // `new Date(log_date).toDateString()`, which is the day before west of UTC.
  const formatDate = (dateString) => {
    const day = utcDateString(dateString);
    const today = localDateString();
    if (day === today) return 'Today';

    // "Yesterday" from the viewer's own local calendar, not
    // `Date.now() - 86400000` — that drifts across a DST transition.
    const now = new Date();
    const yesterday = localDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    if (day === yesterday) return 'Yesterday';

    return displayCalendarDate(dateString, 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

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
    <Surface>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
        <SectionLabel>Weight log</SectionLabel>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          {sortedLogs.length} {sortedLogs.length === 1 ? 'entry' : 'entries'}
        </Typography>
      </Box>

      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {visible.map((log, index) => {
          const weight = parseFloat(log.weight_value).toFixed(1);
          const when = formatDate(log.log_date);
          const fromScale = log.source === 'arboleaf_xlsx';
          return (
            <Box
              component="li"
              key={log.id}
              data-testid="weight-log-row"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 1,
                ...(index < visible.length - 1 && {
                  borderBottom: (t) => `1px solid ${t.palette.divider}`,
                }),
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <StatNumber value={weight} decimals={1} unit={unit} size="body" />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>{when}</Typography>
                  {fromScale && (
                    // Outlined in the text ink rather than a filled chip: a
                    // 12px label on a tinted fill is the contrast landmine
                    // the harness keeps finding, and a source marker should be
                    // quieter than the value it annotates anyway.
                    <Box
                      component="span"
                      title="Imported from the scale"
                      sx={{
                        px: 0.75,
                        border: (t) => `1px solid ${t.palette.divider}`,
                        borderRadius: '6px',
                        color: 'text.secondary',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        letterSpacing: '0.02em',
                        lineHeight: 1.6,
                      }}
                    >
                      Scale
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
                  aria-label={`Edit the ${weight} ${unit} entry from ${when}`}
                  sx={{ width: 44, height: 44, color: 'text.secondary' }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton
                onClick={() => onDelete(log.id)}
                aria-label={`Delete the ${weight} ${unit} entry from ${when}`}
                sx={{ width: 44, height: 44, color: 'text.secondary' }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
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
    </Surface>
  );
};

export default WeightLogList;

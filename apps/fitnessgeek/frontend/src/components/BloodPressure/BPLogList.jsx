import React, { useState } from 'react';
import { Typography, Box, Button, IconButton } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { localDateString, utcDateString } from '@geeksuite/utils';
import { categorizeBP } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';
import { nearDay } from '../../utils/dates.js';
import { formatLocalTime } from './bpTimeUtils.js';
import { DeleteOutline as DeleteIcon, EditOutlined as EditIcon } from '@mui/icons-material';
import { LabelPanel, ListRow, Tag } from '../primitives';

/** Rows shown before "Show all": the list is a record, not the page. */
export const INITIAL_ROWS = 10;

const BPLogList = ({ logs: rawLogs, onDelete, onEdit, unit = "mmHg" }) => {
  const theme = useTheme();
  const [showAll, setShowAll] = useState(false);
  // A null row or one missing a number (a partial record) is skipped, not a crash.
  const logs = (Array.isArray(rawLogs) ? rawLogs : []).filter((l) => l && l.systolic != null && l.diastolic != null);
  // The stage colour is the theme's one small set (bpUtils: success / warning
  // / error), the fill of a Tag that always carries the plain words.
  // Remove is quiet at rest and only turns red under the thumb (B7).
  const quietDelete = {
    color: 'text.secondary',
    '&:hover, &:active': { color: 'error.main', backgroundColor: alpha(theme.palette.error.main, 0.08) },
  };

  // `log_date` is a CALENDAR date stored at UTC midnight, not an instant.
  // Rendering it with a plain `toLocaleDateString` showed the previous day for
  // every reader west of UTC, and the "time" that used to sit beside it was
  // always 7:00 PM — UTC midnight in Central, not a time anybody logged.
  // `utcDateString` takes the stored calendar day; the time is gone. Words
  // per review U-5: "Today", "Yesterday", a weekday for the last week, else
  // "Oct 13" (the year only when it isn't this year).
  const formatDate = (dateString) => nearDay(utcDateString(dateString), localDateString());

  if (logs.length === 0) {
    return (
      <LabelPanel title="Your readings">
        <Typography variant="body2" sx={{ color: 'text.secondary', pt: 1.5 }}>
          No readings yet
        </Typography>
      </LabelPanel>
    );
  }

  // Sort by calendar day (newest first), then — now that more than one
  // reading a day is normal, see the shared schema's header — by the actual
  // time within that day, also newest first, so the most recent reading of
  // "today" (this evening's, say) leads and this morning's follows it. Falls
  // back to `log_date` for the tie-break if a row has no `measured_at` yet
  // (a pre-rollout row, or a stage where the GraphQL layer isn't returning
  // it) — same instant, so it's a stable no-op, not a crash.
  const sortedLogs = [...logs].sort((a, b) => {
    const dayDiff = new Date(b.log_date) - new Date(a.log_date);
    if (dayDiff !== 0) return dayDiff;
    return new Date(b.measured_at || b.log_date) - new Date(a.measured_at || a.log_date);
  });

  const visible = showAll ? sortedLogs : sortedLogs.slice(0, INITIAL_ROWS);

  return (
    <LabelPanel
      title="Your readings"
      action={
        <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
          {sortedLogs.length} {sortedLogs.length === 1 ? 'reading' : 'readings'}
        </Typography>
      }
    >
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {visible.map((log, index) => {
          const bpStatus = categorizeBP(log.systolic, log.diastolic, theme.palette.mode);
          const readingLabel = `${log.systolic}/${log.diastolic} ${unit} reading from ${formatDate(log.log_date)}`;
          const deleteLabel = `Remove the ${readingLabel}`;
          const editLabel = `Edit the ${readingLabel}`;
          // An instant, unlike `log_date` — rendered in the viewer's own
          // timezone, not forced to UTC. Empty string (not a fabricated
          // time) when the row has none yet.
          const timeLabel = formatLocalTime(log.measured_at);

          return (
            <ListRow component="li" key={log.id || log._id} first={index === 0} data-testid="bp-log-row" sx={{ gap: 1, py: 1.5 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 2, rowGap: 0.5, flexWrap: 'wrap' }}>
                  <Typography component="span" sx={{ fontWeight: 700, fontSize: '1.0625rem', fontVariantNumeric: 'tabular-nums' }}>
                    {log.systolic}/{log.diastolic}
                    <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}> {unit}</Box>
                  </Typography>
                  <Tag fill={bpStatus.color}>{bpStageWords(bpStatus.stage).label}</Tag>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 2, flexWrap: 'wrap', mt: 0.5 }}>
                  {Number(log.pulse) > 0 && (
                    <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
                      ♥ {log.pulse} bpm
                    </Typography>
                  )}
                  <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
                    {formatDate(log.log_date)}
                    {timeLabel && ` • ${timeLabel}`}
                  </Typography>
                </Box>
              </Box>
              {onEdit && (
                <IconButton
                  aria-label={editLabel}
                  onClick={() => onEdit(log)}
                  sx={{ width: 44, height: 44, color: 'text.secondary' }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              )}
              <IconButton
                aria-label={deleteLabel}
                onClick={() => onDelete(log.id || log._id)}
                sx={{ ...quietDelete, width: 44, height: 44 }}
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
    </LabelPanel>
  );
};

export default BPLogList;

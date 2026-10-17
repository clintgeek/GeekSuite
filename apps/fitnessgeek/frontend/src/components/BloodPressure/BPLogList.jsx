import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  IconButton,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { localDateString, utcDateString } from '@geeksuite/utils';
import { categorizeBP } from '../../utils/bpUtils.js';
import { bpStageWords } from '../../utils/plainWords.js';
import { nearDay } from '../../utils/dates.js';
import { formatLocalTime } from './bpTimeUtils.js';
import {
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
  MonitorHeartOutlined as BPIcon
} from '@mui/icons-material';

const BPLogList = ({ logs, onDelete, onEdit, unit = "mmHg" }) => {
  const theme = useTheme();
  // The stage colour is the theme's semantic tone for this mode (bpUtils), as
  // the tag's wash and the heart icon; the words are ink, because success
  // green on its own tint measured 4.35:1. One info-tag shape (visual review
  // B5): round, 28px, no border.
  const stageTag = (color) => ({
    backgroundColor: alpha(color, 0.14),
    color: 'text.primary',
    fontWeight: 700,
    height: 28,
    borderRadius: 999,
    '& .MuiChip-label': { fontSize: '0.875rem' },
  });
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
      <Card sx={{ width: '100%', display: 'block' }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: 100,
            color: theme.palette.text.secondary
          }}>
            <Typography variant="body2">
              No readings yet
            </Typography>
          </Box>
        </CardContent>
      </Card>
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

  return (
    <Card sx={{ width: '100%', display: 'block' }}>
      <CardContent sx={{ p: 3 }}>

        <List sx={{ p: 0, m: 0, width: '100%' }}>
          {sortedLogs.map((log) => {
            const bpStatus = categorizeBP(log.systolic, log.diastolic, theme.palette.mode);
            const readingLabel = `${log.systolic}/${log.diastolic} ${unit} reading from ${formatDate(log.log_date)}`;
            const deleteLabel = `Remove the ${readingLabel}`;
            const editLabel = `Edit the ${readingLabel}`;
            // An instant, unlike `log_date` — rendered in the viewer's own
            // timezone, not forced to UTC. Empty string (not a fabricated
            // time) when the row has none yet.
            const timeLabel = formatLocalTime(log.measured_at);

            return (
              <ListItem
                disableGutters
                key={log.id || log._id}
                sx={{
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: '16px',
                  mb: 1,
                  backgroundColor: theme.palette.background.paper,
                  '&:last-child': { mb: 0 },
                  py: 1.5,
                  px: { xs: 2, md: 3 },
                  display: 'flex',
                  flexDirection: { xs: 'column', md: 'row' },
                  alignItems: { xs: 'stretch', md: 'center' },
                  justifyContent: { xs: 'flex-start', md: 'space-between' },
                  width: '100%',
                  gap: { xs: 0.5, md: 0 }
                }}
              >
                {/* Mobile Layout */}
                <Box sx={{ display: { xs: 'block', md: 'none' }, width: '100%' }}>
                  {/* Row 1: Icon + BP + Status + Delete */}
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <BPIcon sx={{ color: bpStatus.color, fontSize: 24 }} />
                      <Typography variant="h6" sx={{ fontSize: '1rem' }}>
                        {log.systolic}/{log.diastolic} {unit}
                      </Typography>
                      <Chip
                        label={bpStageWords(bpStatus.stage).label}
                        size="small"
                        sx={stageTag(bpStatus.color)}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      {onEdit && (
                        <IconButton
                          edge="end"
                          aria-label={editLabel}
                          onClick={() => onEdit(log)}
                          sx={{ color: 'text.secondary', p: 0.5 }}
                          size="small"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton
                        edge="end"
                        aria-label={deleteLabel}
                        onClick={() => onDelete(log.id || log._id)}
                        sx={{ ...quietDelete, p: 0.5 }}
                        size="small"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {/* Row 2: Pulse + Date + Time */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, pl: 5, flexWrap: 'wrap' }}>
                    {log.pulse && (
                      <Typography variant="body2" sx={{ fontWeight: 500, color: theme.palette.text.secondary }}>
                        ♥ {log.pulse} bpm
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(log.log_date)}
                      {timeLabel && ` • ${timeLabel}`}
                    </Typography>
                  </Box>
                </Box>

                {/* Desktop Layout */}
                <Box sx={{ display: { xs: 'none', md: 'contents' } }}>
                  {/* Left: Icon + BP Reading */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
                    <BPIcon sx={{ color: bpStatus.color, fontSize: 28 }} />
                    <Typography variant="h6">
                      {log.systolic}/{log.diastolic} {unit}
                    </Typography>
                  </Box>

                  {/* Pulse */}
                  <Box sx={{ flex: '0 0 auto' }}>
                    {log.pulse ? (
                      <Typography variant="body1" sx={{ fontWeight: 500, color: theme.palette.text.secondary }}>
                        ♥ {log.pulse} bpm
                      </Typography>
                    ) : (
                      <Typography variant="body1" sx={{ color: 'transparent' }}>
                        ♥ -- bpm
                      </Typography>
                    )}
                  </Box>

                  {/* Status Chip */}
                  <Box sx={{ flex: '0 0 auto' }}>
                    <Chip
                      label={bpStageWords(bpStatus.stage).label}
                      size="small"
                      sx={stageTag(bpStatus.color)}
                    />
                  </Box>

                  {/* Date/Time */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '0 0 auto' }}>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(log.log_date)}
                      {timeLabel && ` • ${timeLabel}`}
                    </Typography>
                  </Box>

                  {/* Edit Button */}
                  {onEdit && (
                    <Box sx={{ flex: '0 0 auto' }}>
                      <IconButton
                        edge="end"
                        aria-label={editLabel}
                        onClick={() => onEdit(log)}
                        sx={{ color: 'text.secondary' }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Box>
                  )}

                  {/* Delete Button */}
                  <Box sx={{ flex: '0 0 auto' }}>
                    <IconButton
                      edge="end"
                      aria-label={deleteLabel}
                      onClick={() => onDelete(log.id || log._id)}
                      sx={quietDelete}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>
              </ListItem>
            );
          })}
        </List>
      </CardContent>
    </Card>
  );
};

export default BPLogList;
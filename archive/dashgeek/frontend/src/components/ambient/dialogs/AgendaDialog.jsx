import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTheme } from '@mui/material/styles';
import {
  eventStart,
  getDayLabel,
  formatTime,
  timeRemaining,
} from '../Agenda';

function formatTimeRange(ev) {
  const start = ev.start?.dateTime;
  const end = ev.end?.dateTime;
  if (!start) return 'All day';
  const s = formatTime(start);
  const e = end ? formatTime(end) : '';
  return e ? `${s} – ${e}` : s;
}

export default function AgendaDialog({ open, onClose, events = [] }) {
  const theme = useTheme();
  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

  let lastDay = null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="agenda-dialog-title"
      slotProps={{
        backdrop: { sx: { backdropFilter: 'blur(6px)' } },
      }}
    >
      <DialogTitle
        id="agenda-dialog-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${theme.palette.divider}`,
          fontFamily: monoStack,
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        Schedule
        <IconButton onClick={onClose} aria-label="Close" size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ py: 2 }}>
        {events.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Nothing on the calendar.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {events.map((ev, i) => {
              const start = eventStart(ev);
              const dayLabel = getDayLabel(start);
              const showDay = dayLabel !== lastDay;
              lastDay = dayLabel;
              const isNow = timeRemaining(start) === 'Now';

              return (
                <React.Fragment key={ev.id ?? `${start}-${i}`}>
                  {showDay && (
                    <Typography
                      variant="overline"
                      sx={{
                        display: 'block',
                        color: 'text.disabled',
                        letterSpacing: '0.14em',
                        mt: i === 0 ? 0 : 1,
                        mb: 0.25,
                      }}
                    >
                      {dayLabel}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 2,
                        alignSelf: 'stretch',
                        borderRadius: 1,
                        backgroundColor: isNow
                          ? theme.palette.primary.main
                          : theme.palette.border ?? theme.palette.divider,
                        minHeight: 36,
                        flexShrink: 0,
                      }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body1"
                        sx={{
                          color: isNow ? 'text.primary' : 'text.secondary',
                          fontWeight: isNow ? 500 : 400,
                        }}
                      >
                        {ev.summary || '(No title)'}
                      </Typography>
                      <Box
                        component="span"
                        sx={{
                          fontFamily: monoStack,
                          fontSize: '0.75rem',
                          color: 'text.secondary',
                          display: 'block',
                          mt: 0.25,
                        }}
                      >
                        {formatTimeRange(ev)}
                      </Box>
                      {ev.location && (
                        <Chip
                          label={ev.location}
                          size="small"
                          sx={{ mt: 0.5, maxWidth: '100%' }}
                        />
                      )}
                      {ev.description && (
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            color: 'text.disabled',
                            mt: 0.5,
                            fontFamily: 'inherit',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {ev.description}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </React.Fragment>
              );
            })}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

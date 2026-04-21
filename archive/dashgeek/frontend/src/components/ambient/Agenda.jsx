import React, { useCallback, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AmbientCard from './AmbientCard';
import AgendaDialog from './dialogs/AgendaDialog';
import useInterval from '../../hooks/useInterval';

const POLL_MS = 60 * 1000; // 60 s
const MAX_ROWS = 3;

export function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateStr));
}

export function eventStart(ev) {
  return ev?.start?.dateTime || ev?.start?.date || null;
}

export function getDayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const tmrw = new Date(now.getTime() + 86400000);
  if (d.toDateString() === tmrw.toDateString()) return 'Tomorrow';
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(d);
}

export function timeRemaining(dateStr) {
  if (!dateStr) return '';
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return 'Now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h`;
}

export default function Agenda() {
  const theme = useTheme();
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(null);
  const [open, setOpen] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/ambient/calendar/events', { credentials: 'include' });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        setExpired(body.provider ?? 'google');
        setLoading(false);
        return;
      }
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json();
      setEvents(json.events ?? []);
      setExpired(null);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  useInterval(fetchEvents, POLL_MS);

  const visible = useMemo(() => (events ?? []).slice(0, MAX_ROWS), [events]);
  const remainder = events ? Math.max(0, events.length - MAX_ROWS) : 0;

  const monoStack =
    theme.typography.fontFamilyMono ??
    '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

  const hasEvents = events && events.length > 0;
  const isEmpty = !loading && !expired && events && events.length === 0;

  return (
    <>
      <AmbientCard
        domain="primary"
        title="AGENDA"
        loading={loading && !events}
        empty={isEmpty || (!loading && !expired && !events)}
        emptyLabel="All clear"
        expiredProvider={expired}
        onClick={hasEvents ? () => setOpen(true) : undefined}
      >
        {hasEvents && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
            {visible.map((ev) => {
              const start = eventStart(ev);
              const isNow = timeRemaining(start) === 'Now';
              const timeText = ev.start?.dateTime
                ? formatTime(ev.start.dateTime)
                : 'All day';
              const dayLabel = getDayLabel(start);

              return (
                <Box
                  key={ev.id ?? `${start}-${ev.summary}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 1.25,
                    minWidth: 0,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      fontFamily: monoStack,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: '0.6875rem',
                      color: isNow ? 'text.primary' : 'text.secondary',
                      letterSpacing: '0.04em',
                      width: '5.5ch',
                      flexShrink: 0,
                    }}
                  >
                    {timeText}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      fontFamily: monoStack,
                      fontSize: '0.625rem',
                      color: 'text.disabled',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      width: '3.5ch',
                      flexShrink: 0,
                    }}
                  >
                    {dayLabel.slice(0, 3)}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      color: isNow ? 'text.primary' : 'text.secondary',
                      fontWeight: isNow ? 500 : 400,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {ev.summary || '(No title)'}
                  </Typography>
                </Box>
              );
            })}
            {remainder > 0 && (
              <Typography
                variant="caption"
                sx={{ color: 'text.disabled', mt: 0.25 }}
              >
                +{remainder} more
              </Typography>
            )}
          </Box>
        )}
      </AmbientCard>

      <AgendaDialog
        open={open}
        onClose={() => setOpen(false)}
        events={events ?? []}
      />
    </>
  );
}

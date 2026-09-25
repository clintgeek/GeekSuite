/** Recent sessions, newest first, each deletable (its minutes come back off the hours). */
import React, { useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { Add as AddIcon, DeleteOutline as DeleteIcon } from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { formatCalendarDate, formatMinutes, relativeDay } from '../../utils/dates';
import { platformShort } from '../../utils/vocab';
import Section from './Section';

export default function SessionsSection({ sessions = [], onLog, onDelete }) {
  const { notify } = useToast();
  const [showAll, setShowAll] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const shown = showAll ? sessions : sessions.slice(0, 5);
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);

  const remove = async (s) => {
    setBusyId(s.id);
    try {
      await onDelete(s.id);
    } catch {
      notify('Could not delete that session.', { tone: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Section
      title="Sessions"
      id="sessions"
      action={
        <Button startIcon={<AddIcon />} onClick={onLog} sx={{ color: 'text.primary', minHeight: 44 }}>
          Log
        </Button>
      }
    >
      {sessions.length === 0 ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.6 }}>
          No sessions yet. Log one after you play — it adds to your hours and marks the game as played.
        </Typography>
      ) : (
        <>
          <Typography sx={{ fontSize: '0.75rem', color: 'text.muted', mb: 0.5 }}>
            {sessions.length} recent · {formatMinutes(totalMinutes)} in total
          </Typography>
          <Box component="ul" sx={{ m: 0, p: 0 }}>
            {shown.map((s) => (
              <Box
                component="li"
                key={s.id}
                sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 1, minHeight: 48, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
              >
                <Box sx={{ width: 64, flexShrink: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMinutes(s.minutes)}</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: '0.875rem' }}>
                    {relativeDay(s.playedOn)}
                    {s.platform ? <Box component="span" sx={{ color: 'text.secondary' }}>{` · ${platformShort(s.platform)}`}</Box> : null}
                  </Typography>
                  {s.note ? <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{s.note}</Typography> : null}
                </Box>
                <IconButton
                  onClick={() => remove(s)}
                  disabled={busyId === s.id}
                  aria-label={`Delete the ${formatMinutes(s.minutes)} session from ${formatCalendarDate(s.playedOn)}`}
                  sx={{ color: 'text.secondary' }}
                >
                  <DeleteIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
          {sessions.length > 5 ? (
            <Button onClick={() => setShowAll((v) => !v)} sx={{ mt: 0.5, color: 'text.secondary' }}>
              {showAll ? 'Show fewer' : `Show all ${sessions.length}`}
            </Button>
          ) : null}
        </>
      )}
    </Section>
  );
}

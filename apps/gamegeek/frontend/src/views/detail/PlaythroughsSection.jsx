/** Playthroughs: every run, with its dates, hours, platform and how far it went. */
import React, { useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import { Add as AddIcon, DeleteOutline as DeleteIcon, EditOutlined as EditIcon } from '@mui/icons-material';
import { useToast } from '@geeksuite/ui';
import { formatCalendarDate, formatHours } from '../../utils/dates';
import { completionLabel, platformShort } from '../../utils/vocab';
import PlaythroughDialog from './PlaythroughDialog';
import Section from './Section';

function describe(p) {
  const start = p.startedAt ? formatCalendarDate(p.startedAt) : null;
  const end = p.finishedAt ? formatCalendarDate(p.finishedAt) : null;
  if (start && end) return `${start} – ${end}`;
  if (start) return `Started ${start}`;
  if (end) return `Finished ${end}`;
  return 'Dates not recorded';
}

export default function PlaythroughsSection({ playthroughs = [], platforms, completionLevels, onSave, onDelete }) {
  const { notify } = useToast();
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new

  const remove = async (p) => {
    try {
      await onDelete(p.id);
    } catch {
      notify('Could not delete that playthrough.', { tone: 'error' });
    }
  };

  const sorted = [...playthroughs].sort((a, b) => String(b.startedAt || b.finishedAt || '').localeCompare(String(a.startedAt || a.finishedAt || '')));

  return (
    <Section
      title="Playthroughs"
      id="playthroughs"
      action={
        <Button startIcon={<AddIcon />} onClick={() => setEditing(null)} sx={{ color: 'text.primary', minHeight: 44 }}>
          Add
        </Button>
      }
    >
      {sorted.length === 0 ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', lineHeight: 1.6 }}>
          Each run through the game gets its own row — first time, the replay on hard, the 100% cleanup.
        </Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {sorted.map((p, i) => {
            const facts = [formatHours(p.hours), platformShort(p.platform), p.difficulty, p.completion && completionLabel(p.completion)].filter(Boolean);
            const label = `playthrough ${sorted.length - i}`;
            return (
              <Box
                component="li"
                key={p.id}
                sx={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600 }}>
                    {describe(p)}
                    {!p.finishedAt && p.startedAt ? (
                      <Box component="span" sx={{ ml: 1, fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>· in progress</Box>
                    ) : null}
                  </Typography>
                  {facts.length ? <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{facts.join(' · ')}</Typography> : null}
                  {p.notes ? <Typography sx={{ fontSize: '0.75rem', color: 'text.muted', mt: 0.25 }}>{p.notes}</Typography> : null}
                </Box>
                <IconButton onClick={() => setEditing(p)} aria-label={`Edit ${label}`} sx={{ color: 'text.secondary' }}>
                  <EditIcon sx={{ fontSize: 20 }} />
                </IconButton>
                <IconButton onClick={() => remove(p)} aria-label={`Delete ${label}`} sx={{ color: 'text.secondary' }}>
                  <DeleteIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Box>
            );
          })}
        </Box>
      )}
      <PlaythroughDialog
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        playthrough={editing}
        platforms={platforms}
        completionLevels={completionLevels}
        onSave={onSave}
      />
    </Section>
  );
}

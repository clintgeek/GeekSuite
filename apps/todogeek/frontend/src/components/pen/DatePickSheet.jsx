/**
 * DatePickSheet — "pick a date" for one task, in one or two taps: the common
 * answers as buttons, any other day in the browser's own date input.
 * A bottom sheet on phones, a small centred window on desktop (GeekSheet).
 */
import { useEffect, useState } from 'react';
import { Box, Button, TextField } from '@mui/material';
import { format } from 'date-fns';
import { GeekSheet } from '@geeksuite/ui';
import { dueDayKey } from '../../utils/dueDate';
import { quickDates } from '../../utils/penViews';

export default function DatePickSheet({ task, onPick, onClose, now = new Date() }) {
  const [value, setValue] = useState('');
  useEffect(() => { setValue(task ? dueDayKey(task.dueDate) : ''); }, [task]);
  const open = Boolean(task);

  const pick = (key, label) => {
    onPick?.(task, key, label);
    onClose?.();
  };

  return (
    <GeekSheet
      open={open}
      onClose={onClose}
      title="Move to…"
      description={task?.content}
      maxWidth="xs"
    >
      <Box sx={{ display: 'grid', gap: 2, pb: 2 }}>
        {quickDates(now).map((q) => (
          <Button
            key={q.label}
            variant="outlined"
            onClick={() => pick(q.key, `Moved to ${q.label.split(' · ')[0].toLowerCase()}.`)}
            sx={{ minHeight: 48, justifyContent: 'flex-start', px: 4, color: 'text.primary', borderColor: 'divider' }}
          >
            {q.label}
          </Button>
        ))}
        <Box
          component="form"
          onSubmit={(e) => { e.preventDefault(); if (value) pick(value, `Moved to ${format(new Date(`${value}T12:00:00`), 'EEE d MMM')}.`); }}
          sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 1 }}
        >
          <TextField
            label="Another day"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
            sx={{ flex: 1 }}
          />
          <Button type="submit" variant="contained" disabled={!value} sx={{ minHeight: 44, px: 4 }}>Move</Button>
        </Box>
        <Button onClick={() => pick(null, 'Moved to Anytime.')} sx={{ minHeight: 44, color: 'text.secondary', justifySelf: 'start' }}>
          No date (Anytime)
        </Button>
      </Box>
    </GeekSheet>
  );
}

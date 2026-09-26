/**
 * The dates editor: one row per date — kind, an optional label, the day,
 * whether it repeats, a note. Rows keep their server `id` so an edit is an
 * edit, not a delete-and-add.
 */
import React from 'react';
import { Box, Button, IconButton, MenuItem, TextField, Tooltip } from '@mui/material';
import { Add as AddIcon, DeleteOutline as RemoveIcon } from '@mui/icons-material';
import { dateKindLabel } from '../../utils/vocab';
import { recurText } from '../../utils/dates';

export const RECUR_CHOICES = [0, 1, 3, 6, 12, 24, 36, 60];

let tmp = 0;
export const blankDate = (kind = 'warranty') => {
  tmp += 1;
  return { key: `new-${tmp}`, id: null, kind, label: '', date: '', recurEveryMonths: 0, notes: '' };
};

export default function DatesEditor({ rows, onChange, kinds, errors = {} }) {
  const set = (key, patch) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {rows.map((r, i) => (
        <Box
          key={r.key}
          data-testid="date-editor-row"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', sm: '150px minmax(0, 1fr) 160px 150px auto' },
            gap: 1,
            alignItems: 'start',
            p: { xs: 1.25, sm: 0 },
            border: { xs: 1, sm: 0 },
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <TextField select size="small" label="Kind" value={r.kind} onChange={(e) => set(r.key, { kind: e.target.value })}>
            {kinds.map((k) => (
              <MenuItem key={k} value={k}>
                {dateKindLabel(k)}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Label" placeholder="Boat registration" value={r.label} onChange={(e) => set(r.key, { label: e.target.value })} inputProps={{ maxLength: 120 }} />
          <TextField
            size="small"
            type="date"
            label="Date *"
            value={r.date}
            onChange={(e) => set(r.key, { date: e.target.value })}
            InputLabelProps={{ shrink: true }}
            error={Boolean(errors[r.key])}
            helperText={errors[r.key] || undefined}
            inputProps={{ 'aria-label': `Date ${i + 1}` }}
          />
          <TextField select size="small" label="Repeats" value={r.recurEveryMonths || 0} onChange={(e) => set(r.key, { recurEveryMonths: Number(e.target.value) })}>
            {RECUR_CHOICES.map((m) => (
              <MenuItem key={m} value={m}>
                {m ? recurText(m) : 'Once'}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title="Remove this date">
            <IconButton onClick={() => onChange(rows.filter((x) => x.key !== r.key))} aria-label={`Remove date ${i + 1}`} sx={{ color: 'text.secondary', justifySelf: { xs: 'end', sm: 'auto' }, gridColumn: { xs: '2', sm: 'auto' } }}>
              <RemoveIcon />
            </IconButton>
          </Tooltip>
          <TextField
            size="small"
            label="Note"
            value={r.notes}
            onChange={(e) => set(r.key, { notes: e.target.value })}
            inputProps={{ maxLength: 500 }}
            sx={{ gridColumn: { xs: '1 / -1', sm: '2 / 5' } }}
          />
        </Box>
      ))}
      <Box>
        <Button startIcon={<AddIcon />} onClick={() => onChange([...rows, blankDate()])} sx={{ color: 'text.primary' }}>
          Add a date
        </Button>
      </Box>
    </Box>
  );
}

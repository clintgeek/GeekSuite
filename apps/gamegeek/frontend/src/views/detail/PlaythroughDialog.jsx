/** Add or edit one playthrough. Replays are first-class: each run is its own row. */
import React, { useEffect, useState } from 'react';
import { Box, Button, FormControl, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { GeekDialog, useToast } from '@geeksuite/ui';
import { calendarDateToUtcIso, utcIsoToInputValue } from '../../utils/dates';
import { completionLabel, platformLabel } from '../../utils/vocab';

const EMPTY = { startedAt: '', finishedAt: '', hours: '', platform: '', difficulty: '', completion: '', notes: '' };

export function toPlaythroughInput(form, id) {
  const input = {};
  if (id) input.id = id;
  input.startedAt = calendarDateToUtcIso(form.startedAt);
  input.finishedAt = calendarDateToUtcIso(form.finishedAt);
  const h = form.hours === '' ? null : Number(form.hours);
  input.hours = Number.isFinite(h) && h >= 0 ? h : null;
  input.platform = form.platform || null;
  input.difficulty = form.difficulty.trim() || null;
  input.completion = form.completion || null;
  input.notes = form.notes.trim() || null;
  return input;
}

export default function PlaythroughDialog({ open, onClose, playthrough, platforms, completionLevels, onSave }) {
  const { notify } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      playthrough
        ? {
            startedAt: utcIsoToInputValue(playthrough.startedAt),
            finishedAt: utcIsoToInputValue(playthrough.finishedAt),
            hours: playthrough.hours ?? '',
            platform: playthrough.platform || '',
            difficulty: playthrough.difficulty || '',
            completion: playthrough.completion || '',
            notes: playthrough.notes || '',
          }
        : EMPTY
    );
  }, [open, playthrough]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    if (form.startedAt && form.finishedAt && form.finishedAt < form.startedAt) {
      notify('The finish date is before the start.', { tone: 'warning' });
      return;
    }
    setBusy(true);
    try {
      await onSave(toPlaythroughInput(form, playthrough?.id));
      onClose();
    } catch {
      notify('That playthrough did not save.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeekDialog
      open={open}
      onClose={onClose}
      title={playthrough ? 'Edit playthrough' : 'Add a playthrough'}
      primaryAction={<Button variant="contained" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>}
      secondaryAction={<Button onClick={onClose} sx={{ color: 'text.secondary' }}>Cancel</Button>}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
        <TextField type="date" label="Started" value={form.startedAt} onChange={set('startedAt')} InputLabelProps={{ shrink: true }} />
        <TextField type="date" label="Finished" value={form.finishedAt} onChange={set('finishedAt')} InputLabelProps={{ shrink: true }} helperText="Leave empty while it's still going" />
        <TextField label="Hours" value={form.hours} onChange={set('hours')} inputProps={{ inputMode: 'decimal' }} />
        <FormControl>
          <InputLabel id="pt-platform">Platform</InputLabel>
          <Select labelId="pt-platform" label="Platform" value={form.platform} onChange={set('platform')}>
            <MenuItem value=""><em>Not recorded</em></MenuItem>
            {platforms.map((p) => <MenuItem key={p} value={p}>{platformLabel(p)}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Difficulty" placeholder="Normal, Hard, Story mode…" value={form.difficulty} onChange={set('difficulty')} />
        <FormControl>
          <InputLabel id="pt-completion">Completion</InputLabel>
          <Select labelId="pt-completion" label="Completion" value={form.completion} onChange={set('completion')}>
            <MenuItem value=""><em>Not finished / not saying</em></MenuItem>
            {completionLevels.map((c) => <MenuItem key={c} value={c}>{completionLabel(c)}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField label="Notes" value={form.notes} onChange={set('notes')} multiline minRows={2} sx={{ gridColumn: { sm: '1 / -1' } }} />
      </Box>
    </GeekDialog>
  );
}

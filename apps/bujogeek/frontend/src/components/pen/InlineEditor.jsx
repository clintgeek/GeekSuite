/**
 * InlineEditor — a task's details, opened in place under its row. No dialog
 * (DOCS/SIMPLE_PLAN.md § "A task row").
 *
 * Text, date and time, tags, priority, note. Date and time are the browser's
 * own inputs: on a phone they open the system pickers, and they cost no
 * bundle. Clearing the date makes the task "Anytime"; a date with no time is
 * date-only (UTC midnight), a date with a time is an instant — the same rule
 * the gateway and reminders use (utils/dueDate.js).
 *
 * A task that already REPEATS keeps its Repeats select exactly as the old
 * editor had it (None / Daily / Weekly / Monthly → RRULE), and saving one asks
 * "this one or the series?" with the existing dialog. Repeats are not offered
 * on a task that does not have them: that is Phase 2's redesign.
 *
 * Only changed fields are sent.
 */
import { useMemo, useState } from 'react';
import {
  Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import RecurringEditDialog from '../tasks/RecurringEditDialog';
import { PRIORITIES, changedFields, initialForm, isRepeating } from './editorForm';

export default function InlineEditor({ task, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState(() => initialForm(task));
  const [saving, setSaving] = useState(false);
  const [askScope, setAskScope] = useState(false);
  const repeating = isRepeating(task);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const changes = useMemo(() => changedFields(task, form), [task, form]);
  const empty = !form.content.trim();

  const commit = async (scope = 'THIS_INSTANCE') => {
    setSaving(true);
    const ok = await onSave?.(changes, scope);
    setSaving(false);
    if (ok !== false) onCancel?.();
  };

  const submit = (e) => {
    e?.preventDefault();
    if (empty) return;
    if (!Object.keys(changes).length) { onCancel?.(); return; }
    if (repeating) { setAskScope(true); return; }
    commit();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel?.(); }
  };

  const idBase = `edit-${String(task.id ?? task._id)}`;

  return (
    <Box component="form" onSubmit={submit} onKeyDown={onKeyDown} aria-label={`Edit ${task.content}`} sx={{ display: 'grid', gap: 3, pt: 1 }}>
      <TextField
        label="Task"
        value={form.content}
        onChange={set('content')}
        autoFocus
        fullWidth
        size="small"
        inputProps={{ 'aria-describedby': `${idBase}-hint` }}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr 2fr' }, gap: 3, alignItems: 'start' }}>
        <TextField label="Date" type="date" value={form.date} onChange={set('date')} size="small" InputLabelProps={{ shrink: true }} />
        <TextField label="Time" type="time" value={form.time} onChange={set('time')} size="small" InputLabelProps={{ shrink: true }} disabled={!form.date} />
        <TextField
          label="Tags"
          value={form.tags}
          onChange={set('tags')}
          size="small"
          placeholder="#work #fd"
          sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' } }}
        />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={form.priority}
          onChange={(_, v) => v !== null && setForm((f) => ({ ...f, priority: v }))}
          aria-label="Priority"
        >
          {PRIORITIES.map((opt) => (
            <ToggleButton key={opt.value || 'none'} value={opt.value} sx={{ minHeight: 44, minWidth: 56, textTransform: 'none', fontWeight: 600 }}>
              {opt.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {form.date && (
          <Button size="small" onClick={() => setForm((f) => ({ ...f, date: '', time: '' }))} sx={{ minHeight: 44, color: 'text.secondary' }}>
            Make it Anytime
          </Button>
        )}
        {repeating && (
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel id={`${idBase}-repeat`}>Repeats</InputLabel>
            <Select labelId={`${idBase}-repeat`} label="Repeats" value={form.repeat} onChange={set('repeat')}>
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
              <MenuItem value="monthly">Monthly</MenuItem>
            </Select>
          </FormControl>
        )}
      </Box>
      <TextField label="Note" value={form.note} onChange={set('note')} multiline minRows={2} maxRows={8} fullWidth size="small" />
      <Box id={`${idBase}-hint`} sx={{ display: 'none' }}>Enter saves. Escape closes without saving.</Box>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button type="submit" variant="contained" disabled={empty || saving} sx={{ minHeight: 44, px: 5 }}>
          Save
        </Button>
        <Button onClick={onCancel} sx={{ minHeight: 44, color: 'text.secondary' }}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => onDelete?.(task)} color="secondary" sx={{ minHeight: 44 }}>Delete</Button>
      </Box>
      <RecurringEditDialog
        open={askScope}
        actionType="edit"
        onClose={() => setAskScope(false)}
        onConfirm={(scope) => { setAskScope(false); commit(scope); }}
      />
    </Box>
  );
}

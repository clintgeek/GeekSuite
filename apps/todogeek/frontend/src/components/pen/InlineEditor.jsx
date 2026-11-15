/**
 * InlineEditor — a task's details, opened in place under its row. No dialog
 * (DOCS/SIMPLE_PLAN.md § "A task row").
 *
 * Text, date and time, tags, priority, Private, note. Private hides the
 * words until tapped (context/PrivacyContext.jsx). Date and time are the browser's
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
 *
 * ## Leaving with changes (plan 1.13)
 * Tapping the row again, or another row, or ticking it, used to throw the form
 * away without a word. Now the host (hooks/usePenRows) asks the open editor
 * to `requestSave()` through `apiRef` first: it saves what changed, or — for a
 * repeating task — opens the "this one or the series?" question and stays
 * open, or — with the words emptied — refuses and stays open. Escape and
 * Cancel are the explicit "never mind" and still discard.
 *
 * ## Where it opens
 * `layout="inline"` (a desktop): in the list, under its row. `layout="sheet"`
 * (a phone or a narrow tablet): in a bottom sheet, Save in a footer that stays
 * above the keyboard (it used to open taller than the screen with Save off the
 * bottom). The keyboard opens by itself only with a fine pointer: on a touch
 * screen a tap on a row should not pop it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Select, TextField, ToggleButton,
  ToggleButtonGroup, useMediaQuery,
} from '@mui/material';
import { EyeOff } from 'lucide-react';
import { useGeekToastClearance } from '@geeksuite/ui';
import RecurringEditDialog from '../tasks/RecurringEditDialog';
import { PRIORITIES, changedFields, initialForm, isRepeating } from './editorForm';

export default function InlineEditor({ task, onSave, onCancel, onDelete, apiRef, layout = 'inline' }) {
  const [form, setForm] = useState(() => initialForm(task));
  const [saving, setSaving] = useState(false);
  const [askScope, setAskScope] = useState(false);
  const repeating = isRepeating(task);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const changes = useMemo(() => changedFields(task, form), [task, form]);
  const empty = !form.content.trim();
  const fine = useMediaQuery('(pointer: fine)');
  const sheet = layout === 'sheet';
  const footerRef = useRef(null);
  // Toasts rise above the sheet's Save footer instead of covering it.
  useGeekToastClearance(footerRef, sheet);

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

  // The host's "leave with changes" question (see the header).
  useEffect(() => {
    if (!apiRef) return undefined;
    const api = {
      hasChanges: () => Object.keys(changes).length > 0,
      requestSave: () => {
        if (!Object.keys(changes).length) return 'clean';
        if (empty) return 'blocked';
        if (repeating) { setAskScope(true); return 'asked'; }
        commit();
        return 'saved';
      },
    };
    apiRef.current = api;
    return () => { if (apiRef.current === api) apiRef.current = null; };
  });

  const onKeyDown = (e) => {
    // Escape inside the "this one or the series?" dialog closes the dialog, not
    // the edit: its keydown bubbles through the React tree to this form.
    if (e.key === 'Escape' && !askScope) { e.stopPropagation(); onCancel?.(); }
  };

  const idBase = `edit-${String(task.id ?? task._id)}`;

  return (
    <Box component="form" onSubmit={submit} onKeyDown={onKeyDown} aria-label={`Edit ${task.content}`} sx={{ display: 'grid', gap: 3, pt: 1 }}>
      <TextField
        label="Task"
        value={form.content}
        onChange={set('content')}
        autoFocus={fine}
        fullWidth
        size="small"
        inputProps={{ 'aria-describedby': `${idBase}-hint` }}
      />
      {/* The date input needs ~150px for "11/15/2026" and its picker icon: the
          columns have a floor, so the last digit is never clipped. */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(150px, 1.2fr) minmax(110px, 1fr)', sm: 'minmax(160px, 1fr) minmax(120px, 1fr) 2fr' },
        gap: 3,
        alignItems: 'start',
      }}
      >
        <TextField label="Date" type="date" value={form.date} onChange={set('date')} size="small" InputLabelProps={{ shrink: true }} sx={{ minWidth: 0 }} />
        <TextField label="Time" type="time" value={form.time} onChange={set('time')} size="small" InputLabelProps={{ shrink: true }} disabled={!form.date} sx={{ minWidth: 0 }} />
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
        <FormControlLabel
          sx={{ m: 0, minHeight: 44, pr: 2, color: 'text.primary', '& .MuiFormControlLabel-label': { display: 'inline-flex', alignItems: 'center', gap: 1.5, fontWeight: 600 } }}
          control={(
            <Checkbox
              checked={form.private}
              onChange={(e) => setForm((f) => ({ ...f, private: e.target.checked }))}
              inputProps={{ 'aria-describedby': `${idBase}-private-hint` }}
              sx={{ width: 44, height: 44, color: 'text.secondary', '&.Mui-checked': { color: 'text.primary' } }}
            />
          )}
          label={<><EyeOff size={16} strokeWidth={1.75} aria-hidden />Private</>}
        />
        <Box id={`${idBase}-private-hint`} sx={{ display: 'none' }}>Hidden until you tap or click it.</Box>
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
      <Box
        ref={footerRef}
        data-editor-footer={sheet ? 'sticky' : undefined}
        sx={{
          display: 'flex', gap: 2, alignItems: 'center',
          // In the sheet the footer stays at the bottom edge while the form scrolls.
          ...(sheet ? {
            position: 'sticky', bottom: 0, zIndex: 1, mx: -2, px: 2, pt: 2,
            pb: 'calc(8px + env(safe-area-inset-bottom))',
            bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider',
          } : null),
        }}
      >
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

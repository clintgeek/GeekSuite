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
 * editor had it (None / Daily / Weekly / Monthly → RRULE). Repeats are not
 * offered on a task that does not have them: that is Phase 2's redesign.
 *
 * ## Ruled paper (UX review 2026-11-18 #3)
 * The editor was the one stock-Material screen: outlined boxes with floating
 * labels (the first one clipped by the phone sheet's top edge, "Iask"), a
 * segmented priority control marked by a faint fill, and a centred dialog
 * asking about "this instance" with radios and Cancel/OK. Now every field is a
 * small grey label ABOVE a line of ink on a single hairline (2px ink while it
 * has focus), priority is chosen by the margin marks the list already draws
 * (none / short grey / short red / full red, the chosen one in ink and
 * underlined), and a repeating task with changes has two buttons where Save
 * was — "Save this one" and "Save every one" — one tap, no dialog. Leaving
 * such a task with changes (another row, the sheet dismissed) keeps it open
 * and says why above those two buttons.
 *
 * Only changed fields are sent.
 *
 * ## Leaving with changes (plan 1.13)
 * Tapping the row again, or another row, or ticking it, used to throw the form
 * away without a word. Now the host (hooks/usePenRows) asks the open editor
 * to `requestSave()` through `apiRef` first: it saves what changed, or — for a
 * repeating task — asks "this one or every one?" in the footer and stays
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
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Checkbox, FormControlLabel, InputBase, MenuItem, Select, ToggleButton, ToggleButtonGroup,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { EyeOff } from 'lucide-react';
import { useGeekToastClearance } from '@geeksuite/ui';
import { penOf } from '../../theme/pen';
import { PRIORITIES, changedFields, initialForm, isRepeating } from './editorForm';

/** The hairline under every field; 2px of ink while it has focus. */
const lineSx = (p) => ({
  width: '100%',
  fontSize: '1rem',
  color: p.ink,
  borderBottom: `1px solid ${p.rule}`,
  '&.Mui-focused': { borderBottomColor: p.ink, boxShadow: `inset 0 -1px 0 ${p.ink}` },
  '&.Mui-disabled': { color: p.faint, borderBottomStyle: 'dashed' },
  // The 2px ink line IS the focus mark here; the suite's outline would box it.
  '& input, & textarea': { py: 1.5, '&:focus-visible': { outline: 'none' } },
  '& input::-webkit-calendar-picker-indicator': { cursor: 'pointer' },
});

/** A small grey label above its field: never floating, so never clipped. */
function PenField({ id, label, children, sx }) {
  const theme = useTheme();
  const p = penOf(theme);
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      <Box
        component="label"
        htmlFor={id}
        id={`${id}-label`}
        sx={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: p.grey, lineHeight: '18px' }}
      >
        {label}
      </Box>
      {children}
    </Box>
  );
}

/** The margin mark a priority draws on its row, small, beside its word. */
function MarginMark({ value, p }) {
  const n = Number(value) || 0;
  return (
    <Box
      component="span"
      aria-hidden
      data-editor-mark={n || 'none'}
      sx={{
        display: 'inline-block', width: 4, borderRadius: '2px', flexShrink: 0,
        height: n === 1 ? 20 : n === 2 ? 14 : n === 3 ? 8 : 0,
        backgroundColor: n === 3 ? p.box : p.red,
      }}
    />
  );
}

export default function InlineEditor({ task, onSave, onCancel, onDelete, apiRef, layout = 'inline' }) {
  const theme = useTheme();
  const p = penOf(theme);
  const [form, setForm] = useState(() => initialForm(task));
  const [saving, setSaving] = useState(false);
  const [askScope, setAskScope] = useState(false);
  const repeating = isRepeating(task);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const changes = useMemo(() => changedFields(task, form), [task, form]);
  const changed = Object.keys(changes).length > 0;
  const empty = !form.content.trim();
  const fine = useMediaQuery('(pointer: fine)');
  const sheet = layout === 'sheet';
  const footerRef = useRef(null);
  const thisOneRef = useRef(null);
  const uid = useId();
  // Toasts rise above the sheet's Save footer instead of covering it.
  useGeekToastClearance(footerRef, sheet);
  // A repeating task with changes: which ones to save is the Save button.
  const choosing = repeating && changed;

  const commit = async (scope = 'THIS_INSTANCE') => {
    setSaving(true);
    const ok = await onSave?.(changes, scope);
    setSaving(false);
    if (ok !== false) onCancel?.();
  };

  const ask = () => {
    setAskScope(true);
    // Said above the two buttons, and the first of them takes focus.
    if (typeof window !== 'undefined') window.requestAnimationFrame?.(() => thisOneRef.current?.focus?.());
  };

  const submit = (e) => {
    e?.preventDefault();
    if (empty) return;
    if (!changed) { onCancel?.(); return; }
    if (repeating) { ask(); return; }
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
        if (repeating) { ask(); return 'asked'; }
        commit();
        return 'saved';
      },
    };
    apiRef.current = api;
    return () => { if (apiRef.current === api) apiRef.current = null; };
  });

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onCancel?.(); return; }
    // With no Save button (a repeating task with changes) Enter in a line
    // asks which ones, as Save did; it never guesses.
    if (e.key === 'Enter' && choosing && e.target?.tagName === 'INPUT') { e.preventDefault(); ask(); }
  };

  const idBase = `edit-${String(task.id ?? task._id)}-${uid.replace(/:/g, '')}`;
  const ids = {
    task: `${idBase}-task`, date: `${idBase}-date`, time: `${idBase}-time`, tags: `${idBase}-tags`,
    note: `${idBase}-note`, repeat: `${idBase}-repeat`, priority: `${idBase}-priority`,
  };

  return (
    <Box
      component="form"
      onSubmit={submit}
      onKeyDown={onKeyDown}
      aria-label={`Edit ${task.content}`}
      data-pen-editor
      sx={{ display: 'grid', gap: 4, pt: sheet ? 2 : 1 }}
    >
      <PenField id={ids.task} label="Task">
        <InputBase
          id={ids.task}
          value={form.content}
          onChange={set('content')}
          autoFocus={fine}
          fullWidth
          inputProps={{ 'aria-describedby': `${idBase}-hint` }}
          sx={{ ...lineSx(p), fontSize: '1.0625rem', fontWeight: 500 }}
        />
      </PenField>
      {/* The date input needs ~150px for "11/15/2026" and its picker icon, the
          time ~136px for "02:00 PM" and its clock: the columns have a floor,
          so neither is clipped. Tags take their own line everywhere (in the
          desktop pane a third column squeezed Time to "02:00 P", review
          2026-11-18 #6). */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(150px, 1.2fr) minmax(136px, 1fr)',
        columnGap: 4,
        rowGap: 4,
        alignItems: 'start',
      }}
      >
        <PenField id={ids.date} label="Date">
          <InputBase id={ids.date} type="date" value={form.date} onChange={set('date')} sx={lineSx(p)} />
        </PenField>
        <PenField id={ids.time} label="Time">
          <InputBase id={ids.time} type="time" value={form.time} onChange={set('time')} disabled={!form.date} sx={lineSx(p)} />
        </PenField>
        <PenField id={ids.tags} label="Tags" sx={{ gridColumn: '1 / -1' }}>
          <InputBase id={ids.tags} value={form.tags} onChange={set('tags')} placeholder="#work #fd" sx={lineSx(p)} />
        </PenField>
      </Box>

      <Box>
        <Box id={ids.priority} sx={{ fontSize: '0.8125rem', fontWeight: 600, color: p.grey, lineHeight: '18px' }}>Priority</Box>
        <ToggleButtonGroup
          exclusive
          value={form.priority}
          onChange={(_, v) => v !== null && setForm((f) => ({ ...f, priority: v }))}
          aria-labelledby={ids.priority}
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, ml: -2 }}
        >
          {PRIORITIES.map((opt) => (
            <ToggleButton
              key={opt.value || 'none'}
              value={opt.value}
              sx={{
                minHeight: 44, minWidth: 44, px: 2, gap: 1.5,
                border: 'none !important', borderRadius: '4px !important', m: '0 !important',
                textTransform: 'none', fontSize: '0.9375rem', fontWeight: 600, color: p.grey,
                '&:hover': { backgroundColor: p.fill },
                '&.Mui-selected, &.Mui-selected:hover': {
                  backgroundColor: 'transparent', color: p.ink,
                  textDecoration: 'underline', textDecorationThickness: '2px', textUnderlineOffset: '5px',
                },
                '&.Mui-focusVisible': { outline: `2px solid ${p.ink}`, outlineOffset: -2 },
              }}
            >
              <MarginMark value={opt.value} p={p} />
              {opt.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 4, rowGap: 1, alignItems: 'center', ml: -2 }}>
        <FormControlLabel
          sx={{ m: 0, minHeight: 44, pr: 2, color: p.ink, '& .MuiFormControlLabel-label': { display: 'inline-flex', alignItems: 'center', gap: 1.5, fontWeight: 600 } }}
          control={(
            <Checkbox
              checked={form.private}
              onChange={(e) => setForm((f) => ({ ...f, private: e.target.checked }))}
              inputProps={{ 'aria-describedby': `${idBase}-private-hint` }}
              sx={{ width: 44, height: 44, color: p.box, '&.Mui-checked': { color: p.ink } }}
            />
          )}
          label={<><EyeOff size={16} strokeWidth={1.75} aria-hidden />Private</>}
        />
        <Box id={`${idBase}-private-hint`} sx={{ display: 'none' }}>Hidden until you tap or click it.</Box>
        {form.date && (
          <Button
            onClick={() => setForm((f) => ({ ...f, date: '', time: '' }))}
            sx={{ minHeight: 44, px: 2, color: p.grey, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}
          >
            Make it Anytime
          </Button>
        )}
      </Box>

      {repeating && (
        <PenField id={ids.repeat} label="Repeats" sx={{ maxWidth: 240 }}>
          <Select
            labelId={`${ids.repeat}-label`}
            id={ids.repeat}
            value={form.repeat}
            onChange={set('repeat')}
            input={<InputBase sx={lineSx(p)} />}
          >
            <MenuItem value="none">Never</MenuItem>
            <MenuItem value="daily">Daily</MenuItem>
            <MenuItem value="weekly">Weekly</MenuItem>
            <MenuItem value="monthly">Monthly</MenuItem>
          </Select>
        </PenField>
      )}

      <PenField id={ids.note} label="Note">
        <InputBase id={ids.note} value={form.note} onChange={set('note')} multiline minRows={2} maxRows={8} fullWidth sx={lineSx(p)} />
      </PenField>
      <Box id={`${idBase}-hint`} sx={{ display: 'none' }}>Enter saves. Escape closes without saving.</Box>
      <Box
        ref={footerRef}
        data-editor-footer={sheet ? 'sticky' : undefined}
        sx={{
          display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 1, alignItems: 'center',
          // In the sheet the footer stays at the bottom edge while the form scrolls.
          ...(sheet ? {
            position: 'sticky', bottom: 0, zIndex: 1, mx: -2, px: 2, pt: 2,
            pb: 'calc(8px + env(safe-area-inset-bottom))',
            bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider',
          } : null),
        }}
      >
        {choosing && askScope && (
          <Box role="alert" data-editor-scope-question sx={{ flexBasis: '100%', fontSize: '0.9375rem', color: p.ink, pb: 1 }}>
            This task repeats. Save the change to this one, or to every one?
          </Box>
        )}
        {choosing ? (
          <>
            <Button
              ref={thisOneRef}
              onClick={() => { if (!empty) commit('THIS_INSTANCE'); }}
              variant="contained"
              disabled={empty || saving}
              sx={{ minHeight: 44, px: 4 }}
            >
              Save this one
            </Button>
            <Button
              onClick={() => { if (!empty) commit('ALL_INSTANCES'); }}
              disabled={empty || saving}
              sx={{ minHeight: 44, px: 2, color: p.ink, textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              Save every one
            </Button>
          </>
        ) : (
          <Button type="submit" variant="contained" disabled={empty || saving} sx={{ minHeight: 44, px: 5 }}>
            Save
          </Button>
        )}
        <Button onClick={onCancel} sx={{ minHeight: 44, color: p.grey }}>Cancel</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={() => onDelete?.(task)} color="secondary" sx={{ minHeight: 44 }}>Delete</Button>
      </Box>
    </Box>
  );
}

import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

/**
 * TaskDueDateField — the due-date/time control, split out of `TaskEditor` so
 * `@mui/x-date-pickers`' picker internals (`useMobilePicker` and the rest of
 * the tail behind `DateTimePicker`, ~150+ kB — see `DOCS/CONTEXT.md` § Frontend
 * — Bundle, "What was left on the table") load only when the editor is
 * actually opened, not with whatever route mounts `TaskEditor` (Q55).
 *
 * `TaskEditor` imports this via `React.lazy`, so this file's own
 * `import '@mui/x-date-pickers/DateTimePicker'` only turns into a network
 * fetch once React actually renders it — which, because `BujoDialog` /
 * `GeekDialog` don't mount their body while closed (`keepMounted` is not set),
 * is the dialog's first open, not the page's first paint. `App.jsx` already
 * provides the `LocalizationProvider`/`AdapterDateFns` context above every
 * route, so this component needs none of its own.
 *
 * Kept as a plain, no-default-export-surprises component (not itself lazy) —
 * the laziness is `TaskEditor`'s call, made once, at the one call site that
 * needs it.
 */
const TaskDueDateField = ({ value, onChange }) => (
  <DateTimePicker
    label="Due date & time"
    value={value}
    onChange={onChange}
    slotProps={{
      textField: {
        fullWidth: true,
        size: 'small',
        // The pickers field isn't a plain MuiTextField, so the suite-wide 44px
        // floor (packages/ui theme, scoped to `.MuiTextField-root
        // .MuiOutlinedInput-root`) never reaches it — apply the floor locally
        // instead (MOBILE_UI_PLAN.md §2).
        sx: {
          minHeight: { xs: 44, md: 'auto' },
          '& .MuiPickersInputBase-root': { minHeight: { xs: 44, md: 'auto' } },
          '& .MuiPickersOutlinedInput-root': { minHeight: { xs: 44, md: 'auto' } },
        },
      },
    }}
  />
);

export default TaskDueDateField;

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

/**
 * MigrationDateField — the "pick a future date" field behind `TaskList`'s
 * Future Date dialog, split out the same way `TaskEditor`'s due-date field
 * was (Q55, `DOCS/CONTEXT.md` § Frontend — Bundle): `@mui/x-date-pickers`
 * only costs a route its bytes if something on that route imports it at
 * module scope, and this file did — unconditionally, for a dialog
 * (`migrationDialogOpen`) that stays closed on every visit but the rare
 * "migrate to a future date" one. `TaskList` is `/search`'s own component
 * (grepped — no other page renders it today), so this was `/search`'s
 * picker cost, independent of `TaskEditor`'s.
 *
 * `React.lazy`'d at both of `TaskList`'s two call sites (the flat-list and
 * grouped-by-date render branches carry an identical copy of this dialog).
 * The nested `LocalizationProvider` is redundant with `App.jsx`'s app-wide
 * one — harmless, and left alone rather than folded into this change.
 */
const MigrationDateField = ({ value, onChange }) => (
  <LocalizationProvider dateAdapter={AdapterDateFns}>
    <DateTimePicker
      label="Date and Time"
      value={value}
      onChange={onChange}
      slotProps={{
        textField: {
          fullWidth: true,
          margin: 'normal',
        },
      }}
    />
  </LocalizationProvider>
);

export default MigrationDateField;

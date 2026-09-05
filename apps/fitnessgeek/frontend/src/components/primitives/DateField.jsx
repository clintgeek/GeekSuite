/**
 * DateField — one calendar-day input, phone-native everywhere.
 *
 * TODO_ORDER #30 "native date pickers" / SUITE_TODO "Native date inputs":
 * fitnessgeek has no MUI X date picker to gate behind a breakpoint — every
 * date-only field here (weight log, BP log, food-log "viewing" day,
 * copy-meal from/to) already used the OS-native `<input type="date">` via a
 * bare MUI `TextField`. What varied was the wrapper around it: some fields
 * had no visible label, sizes and min-widths differed, and `HealthDashboard`
 * hand-rolled its own "no future dates" max. This component is the one
 * place that owns the look, so a new date field gets a label, the 44px
 * touch target (inherited from the app theme's `MuiOutlinedInput` floor —
 * see `theme/theme.jsx`), and optional `min`/`max` for free.
 *
 * Values in and out are always plain `YYYY-MM-DD` strings — the native
 * input's own format, and the convention `@geeksuite/utils`'s
 * `localDateString` / `utcDateString` already produce (see
 * `pages/BloodPressure.jsx`'s `getTodayBP`, `pages/Weight.jsx`). This
 * component never constructs or parses a `Date`, so it cannot reintroduce
 * the calendar-vs-instant bug fixed in 4856227 — callers own that
 * conversion, this just renders and echoes the string.
 */
import { TextField } from '@mui/material';

const DateField = ({
  value,
  onChange,
  label = 'Date',
  min,
  max,
  size = 'small',
  fullWidth = false,
  sx,
  inputProps,
  ...rest
}) => (
  <TextField
    type="date"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    size={size}
    fullWidth={fullWidth}
    {...(label ? { label, InputLabelProps: { shrink: true } } : {})}
    inputProps={{
      ...(min ? { min } : {}),
      ...(max ? { max } : {}),
      ...inputProps,
    }}
    sx={{ minWidth: { xs: '100%', sm: 150 }, ...sx }}
    {...rest}
  />
);

export default DateField;

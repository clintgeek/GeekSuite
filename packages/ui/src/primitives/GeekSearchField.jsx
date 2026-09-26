import { forwardRef } from 'react';
import InputAdornment from '@mui/material/InputAdornment';
import { GeekSlashHint } from '../focus/SlashFocus.jsx';
import { DEFAULT_SLASH_PRIORITY, slashFocusProps } from '../focus/slashFocus.js';
import { GeekTextField } from './GeekTextField.jsx';

/**
 * A search box that answers to `/` (see `focus/slashFocus.js`).
 *
 * `slashFocus` is its priority as a `/` target — default 10; a page's most
 * important box passes more, `false` opts out. `slashHint` shows a `/` keycap
 * at the end of the field on desktop. The hint only fills an empty corner:
 * whenever the app's own `endAdornment` is showing (a clear button once there
 * is a query), that wins.
 *
 * The leading `/` adornment this field used to carry is gone — the keycap is
 * the shortcut hint now, and a `/` at both ends read as a typo.
 */
export const GeekSearchField = forwardRef(function GeekSearchField(
  {
    InputProps,
    inputProps,
    placeholder = 'Search',
    slashFocus = DEFAULT_SLASH_PRIORITY,
    slashHint = true,
    ...props
  },
  ref
) {
  const hint =
    slashHint && slashFocus !== false ? (
      <InputAdornment position="end" aria-hidden="true">
        <GeekSlashHint />
      </InputAdornment>
    ) : null;
  return (
    <GeekTextField
      ref={ref}
      type="search"
      placeholder={placeholder}
      {...slashFocusProps(slashFocus)}
      InputProps={{
        ...InputProps,
        endAdornment: InputProps?.endAdornment || hint,
      }}
      inputProps={{
        'aria-label': placeholder,
        ...inputProps,
      }}
      {...props}
    />
  );
});

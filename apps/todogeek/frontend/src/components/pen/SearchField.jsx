/**
 * SearchField — the search box on Search and Done: a magnifier, the text, and
 * OUR clear button.
 *
 * `type="search"` gives the keyboard its Search key, but WebKit/Blink then
 * paint a native clear glyph in the browser's accent blue — the one blue thing
 * in an app that is ink, paper and one red. The native glyph is switched off
 * and an ink 44px button stands in, shown only when there is text.
 */
import { forwardRef } from 'react';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import { Search, X } from 'lucide-react';

const SearchField = forwardRef(function SearchField({ value, onChange, onClear, label, inputProps, ...rest }, ref) {
  return (
    <TextField
      {...rest}
      inputRef={ref}
      value={value}
      onChange={onChange}
      fullWidth
      inputProps={{ 'aria-label': label, type: 'search', ...inputProps }}
      sx={{
        '& input[type="search"]::-webkit-search-cancel-button, & input[type="search"]::-webkit-search-decoration': {
          WebkitAppearance: 'none',
          appearance: 'none',
          display: 'none',
        },
        ...rest.sx,
      }}
      InputProps={{
        startAdornment: <InputAdornment position="start"><Search size={18} aria-hidden /></InputAdornment>,
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton
              aria-label="Clear search"
              onClick={onClear}
              edge="end"
              sx={{ width: 44, height: 44, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}
            >
              <X size={18} aria-hidden />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
    />
  );
});

export default SearchField;

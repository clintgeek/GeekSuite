import { forwardRef } from 'react';
import InputAdornment from '@mui/material/InputAdornment';
import { GeekTextField } from './GeekTextField.jsx';

export const GeekSearchField = forwardRef(function GeekSearchField(
  { InputProps, inputProps, placeholder = 'Search', ...props },
  ref
) {
  return (
    <GeekTextField
      ref={ref}
      type="search"
      placeholder={placeholder}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start" aria-hidden="true">
            /
          </InputAdornment>
        ),
        ...InputProps,
      }}
      inputProps={{
        'aria-label': placeholder,
        ...inputProps,
      }}
      {...props}
    />
  );
});


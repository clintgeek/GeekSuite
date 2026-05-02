import { forwardRef } from 'react';
import TextField from '@mui/material/TextField';

export const GeekTextField = forwardRef(function GeekTextField(
  { variant = 'outlined', size = 'small', ...props },
  ref
) {
  return <TextField ref={ref} variant={variant} size={size} {...props} />;
});


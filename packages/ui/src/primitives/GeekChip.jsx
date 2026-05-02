import { forwardRef } from 'react';
import Chip from '@mui/material/Chip';

export const GeekChip = forwardRef(function GeekChip(
  { size = 'small', variant = 'outlined', ...props },
  ref
) {
  return <Chip ref={ref} size={size} variant={variant} {...props} />;
});


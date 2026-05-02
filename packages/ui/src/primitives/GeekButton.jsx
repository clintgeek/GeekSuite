import { forwardRef } from 'react';
import Button from '@mui/material/Button';

export const GeekButton = forwardRef(function GeekButton(
  { variant = 'contained', size = 'medium', ...props },
  ref
) {
  return <Button ref={ref} variant={variant} size={size} {...props} />;
});


import { forwardRef } from 'react';
import Paper from '@mui/material/Paper';

export const GeekPanel = forwardRef(function GeekPanel(
  { component = 'section', variant = 'outlined', ...props },
  ref
) {
  return <Paper ref={ref} component={component} variant={variant} {...props} />;
});


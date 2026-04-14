import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import Surface from './Surface';
import DisplayHeading from './DisplayHeading';

/**
 * EmptyState — a consistent empty-state component with voice.
 *
 * Instead of "No items found" everywhere, pages pass a title + copy + optional
 * icon and action. The result feels deliberate instead of skipped.
 */
const EmptyState = ({
  icon: Icon,
  title,
  copy,
  action,
  variant = 'ghost',
  sx,
}) => {
  const theme = useTheme();

  return (
    <Surface
      variant={variant}
      sx={{
        textAlign: 'center',
        py: { xs: 5, sm: 7 },
        px: 3,
        ...sx,
      }}
    >
      {Icon && (
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: '50%',
            backgroundColor: theme.palette.background.paper,
            border: `1px solid ${theme.palette.divider}`,
            color: theme.palette.primary.main,
            mb: 2.5,
          }}
        >
          <Icon sx={{ fontSize: 28 }} />
        </Box>
      )}
      {title && (
        <DisplayHeading size="card" sx={{ mb: 1 }}>
          {title}
        </DisplayHeading>
      )}
      {copy && (
        <Typography
          sx={{
            color: theme.palette.text.secondary,
            fontSize: '0.9375rem',
            maxWidth: 380,
            mx: 'auto',
            lineHeight: 1.55,
            mb: action ? 3 : 0,
          }}
        >
          {copy}
        </Typography>
      )}
      {action && <Box sx={{ mt: action ? 0 : 2 }}>{action}</Box>}
    </Surface>
  );
};

export default EmptyState;

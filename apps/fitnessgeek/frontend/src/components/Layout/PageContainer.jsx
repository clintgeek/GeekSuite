import React from 'react';
import { Box, Typography, useTheme } from '@mui/material';

const PageContainer = ({ title, subtitle, children, maxWidth = 1200, action }) => {
  const theme = useTheme();

  return (
    <Box
      sx={{
        width: '100%',
        maxWidth,
        mx: 'auto',
        px: { xs: 2, sm: 3, md: 4 },
        py: { xs: 2, md: 3 },
      }}
    >
      {(title || action) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            mb: { xs: 2, md: 3 },
            gap: 2,
          }}
        >
          <Box>
            {title && (
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  color: theme.palette.text.primary,
                  mb: subtitle ? 0.5 : 0,
                }}
              >
                {title}
              </Typography>
            )}
            {subtitle && (
              <Typography
                variant="body1"
                sx={{
                  color: theme.palette.text.secondary,
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Box>
      )}
      {children}
    </Box>
  );
};

export default PageContainer;

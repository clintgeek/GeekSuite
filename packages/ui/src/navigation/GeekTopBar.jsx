import { forwardRef } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { geekLayout } from '../designTokens.js';

export const GeekTopBar = forwardRef(function GeekTopBar(
  {
    appName,
    title,
    leading,
    search,
    actions,
    profile,
    settings,
    sx,
    ...props
  },
  ref
) {
  return (
    <AppBar ref={ref} position="sticky" color="default" sx={sx} {...props}>
      <Toolbar
        disableGutters
        sx={{
          minHeight: `${geekLayout.topBarHeight}px !important`,
          px: 2,
          gap: 2,
        }}
      >
        {leading}
        <Box sx={{ minWidth: 0, flex: search ? '0 1 auto' : 1 }}>
          {appName ? (
            <Typography variant="caption" color="text.secondary" noWrap>
              {appName}
            </Typography>
          ) : null}
          {title ? (
            <Typography variant="h3" noWrap>
              {title}
            </Typography>
          ) : null}
        </Box>
        {search ? <Box sx={{ flex: 1, minWidth: 160 }}>{search}</Box> : null}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
            ml: 'auto',
          }}
        >
          {actions}
          {settings}
          {profile}
        </Box>
      </Toolbar>
    </AppBar>
  );
});


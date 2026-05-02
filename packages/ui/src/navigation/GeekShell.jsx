import Box from '@mui/material/Box';
import { geekLayout } from '../designTokens.js';
import { useFocusMode } from '../focus/index.js';

export function GeekShell({
  sidebar,
  topBar,
  children,
  focusMode: focusModeOverride,
  sx,
}) {
  const { focusMode: contextFocusMode } = useFocusMode();
  const focusMode = focusModeOverride ?? contextFocusMode;

  return (
    <Box
      data-geek-shell
      data-focus-mode={focusMode ? 'true' : 'false'}
      sx={{
        display: 'flex',
        minHeight: '100vh',
        bgcolor: 'background.default',
        color: 'text.primary',
        ...sx,
      }}
    >
      {focusMode ? null : sidebar}
      <Box
        component="main"
        sx={{
          minWidth: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {focusMode ? null : topBar}
        <Box
          sx={{
            minHeight: focusMode ? '100vh' : `calc(100vh - ${geekLayout.topBarHeight}px)`,
            flex: 1,
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}


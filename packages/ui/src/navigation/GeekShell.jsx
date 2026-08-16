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
        height: '100vh',
        maxHeight: '100vh',
        overflow: 'hidden',
        bgcolor: 'background.default',
        color: 'text.primary',
        ...sx,
      }}
    >
      {focusMode ? null : sidebar}
      <Box
        sx={{
          minWidth: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {focusMode ? null : topBar}
        <Box
          sx={{
            height: focusMode ? '100vh' : `calc(100vh - ${geekLayout.topBarHeight}px)`,
            minHeight: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            bgcolor: 'background.default',
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}


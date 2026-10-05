import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { ThemeProvider as UserThemeProvider, useThemeMode } from '@geeksuite/user';
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';
import { GeekUpdateIndicator } from '@geeksuite/ui';
// The display faces, self-hosted so headings and the wordmark render offline:
// Bungee (the arcade marquee: wordmark, h1–h3, cover plates) and Space
// Grotesk (h4–h6 and the mid-level labels).
import '@fontsource/bungee/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';
import App from './App.jsx';
import { configureUserPlatform } from './bootstrapUser';
import createGameTheme from './theme/theme';

// generateSW + autoUpdate: a new worker takes over as soon as it installs and
// the page reloads into it (GeekUpdateIndicator shows "Updating…" meanwhile).
registerSW({ immediate: true });

configureUserPlatform();

function ThemedApp() {
  const { theme: mode } = useThemeMode();
  const muiTheme = React.useMemo(() => createGameTheme(mode), [mode]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {/* First open after a deploy: the old build draws, then the new worker
          reloads into the new one (PWA_STANDARD rows 5 + 6). This says so. */}
      <GeekUpdateIndicator />
      <GeekSuiteApolloProvider appName="gamegeek">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </GeekSuiteApolloProvider>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UserThemeProvider>
      <ThemedApp />
    </UserThemeProvider>
  </React.StrictMode>
);

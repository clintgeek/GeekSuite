import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { ThemeProvider as UserThemeProvider, useThemeMode } from '@geeksuite/user';
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';
// The display face, self-hosted so headings and the wordmark render offline.
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import './styles.css';
import App from './App.jsx';
import { configureUserPlatform } from './bootstrapUser';
import createGameTheme from './theme/theme';

// generateSW + autoUpdate: the new worker takes over on the next load.
registerSW({ immediate: true });

configureUserPlatform();

function ThemedApp() {
  const { theme: mode } = useThemeMode();
  const muiTheme = React.useMemo(() => createGameTheme(mode), [mode]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
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

import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { ThemeProvider as UserThemeProvider, useThemeMode } from '@geeksuite/user';
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';
import { GeekUpdateIndicator } from '@geeksuite/ui';
// County Gazette faces, self-hosted so the paper sets offline: Newsreader
// (the editorial serif — headlines, masthead, everything you read) and
// Libre Franklin (the newspaper gothic — section flags, chips, the shell).
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/newsreader/600.css';
import '@fontsource/newsreader/700.css';
import '@fontsource/newsreader/800.css';
import '@fontsource/libre-franklin/400.css';
import '@fontsource/libre-franklin/500.css';
import '@fontsource/libre-franklin/600.css';
import '@fontsource/libre-franklin/700.css';
import './styles.css';
import App from './App.jsx';
import { configureUserPlatform } from './bootstrapUser';
import createNewsTheme from './theme/theme';

// generateSW + autoUpdate: a new worker takes over as soon as it installs and
// the page reloads into it (GeekUpdateIndicator shows "Updating…" meanwhile).
registerSW({ immediate: true });

configureUserPlatform();

function ThemedApp() {
  const { theme: mode } = useThemeMode();
  const muiTheme = React.useMemo(() => createNewsTheme(mode), [mode]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {/* PWA_STANDARD rule 9: "Updating…" during the post-deploy reload. */}
      <GeekUpdateIndicator />
      <GeekSuiteApolloProvider appName="newsgeek">
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

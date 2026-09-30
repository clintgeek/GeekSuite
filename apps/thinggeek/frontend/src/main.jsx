import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { ThemeProvider as UserThemeProvider, useThemeMode } from '@geeksuite/user';
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';
// Label Maker faces, self-hosted so they render offline: Barlow Condensed
// for the tape and headings, Barlow for everything you read.
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/700.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/quicksand/600.css';
import '@fontsource/quicksand/700.css';
import './styles.css';
import App from './App.jsx';
import { configureUserPlatform } from './bootstrapUser';
import createThingTheme from './theme/theme';

// generateSW + autoUpdate: the new worker takes over on the next load.
registerSW({ immediate: true });

configureUserPlatform();

function ThemedApp() {
  const { theme: mode } = useThemeMode();
  const muiTheme = React.useMemo(() => createThingTheme(mode), [mode]);
  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <GeekSuiteApolloProvider appName="thinggeek">
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

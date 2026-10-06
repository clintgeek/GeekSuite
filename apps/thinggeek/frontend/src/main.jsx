import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { ThemeProvider as UserThemeProvider, useThemeMode } from '@geeksuite/user';
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';
import { GeekUpdateIndicator } from '@geeksuite/ui';
// Storage Yard faces, self-hosted so they render offline: Zilla Slab for
// headings (its italic for fleet lettering), Public Sans for everything you
// read, Allerta Stencil for yard stencils. Barlow Condensed is kept for one
// job only: the printed QR labels' names (views/labels/LabelSticker.jsx sizes
// them to its metrics, so print stays the same on every machine).
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';
import '@fontsource/public-sans/800.css';
import '@fontsource/zilla-slab/700.css';
import '@fontsource/zilla-slab/700-italic.css';
import '@fontsource/allerta-stencil/400.css';
import '@fontsource/barlow-condensed/700.css';
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
      {/* PWA_STANDARD rule 9: "Updating…" during the post-deploy reload. */}
      <GeekUpdateIndicator />
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

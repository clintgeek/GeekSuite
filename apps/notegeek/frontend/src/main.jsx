import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

// Self-hosted type, so the installed PWA keeps its faces offline. Both are
// variable fonts: one import each covers every weight the theme uses.
// Spline Sans is titles and body; Spline Sans Mono is small metadata only.
import '@fontsource-variable/spline-sans'
import '@fontsource-variable/spline-sans-mono'

// Import ReactFlow styles
import 'reactflow/dist/style.css';

import { ApolloProvider } from '@apollo/client';
import { apolloClient } from './apolloClient';

// Import custom SASS styles
import './styles/main.scss';

import './index.css'
import { configureUserPlatform } from './bootstrapUser'
import App from './App.jsx'
import AppBootstrapper from './AppBootstrapper.jsx'
import ThemeModeProvider from './theme/ThemeModeProvider.jsx'

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
});

configureUserPlatform();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <ThemeModeProvider>
        <AppBootstrapper>
          <App />
        </AppBootstrapper>
      </ThemeModeProvider>
    </ApolloProvider>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

// Self-hosted type (was jsDelivr + Google Fonts at runtime, which fell back
// to Arial offline). Geist is variable, so one import covers every weight;
// JetBrains Mono carries all metadata, at the three weights the theme uses.
import '@fontsource-variable/geist'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'

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

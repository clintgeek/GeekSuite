import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

// Import ReactFlow styles
import 'reactflow/dist/style.css';

import { GeekSuiteApolloProvider } from '@geeksuite/api-client';

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
    <GeekSuiteApolloProvider appName="notegeek">
      <ThemeModeProvider>
        <AppBootstrapper>
          <App />
        </AppBootstrapper>
      </ThemeModeProvider>
    </GeekSuiteApolloProvider>
  </StrictMode>,
)

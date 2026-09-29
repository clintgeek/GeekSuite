import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { configureUserPlatform } from './bootstrapUser';
// Red Pen's one typeface, self-hosted (DOCS/SIMPLE_PLAN.md § Identity). Latin
// only, four weights: each file is one woff2 the service worker precaches.
import '@fontsource/inter-tight/latin-400.css';
import '@fontsource/inter-tight/latin-500.css';
import '@fontsource/inter-tight/latin-600.css';
import '@fontsource/inter-tight/latin-700.css';
import App from './App.jsx';
import './index.css';
import { ApolloProvider } from '@apollo/client';
import { apolloClient } from './apolloClient';

registerSW({ immediate: true });

configureUserPlatform();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ApolloProvider client={apolloClient}>
      <App />
    </ApolloProvider>
  </React.StrictMode>,
);
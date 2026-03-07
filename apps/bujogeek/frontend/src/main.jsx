import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { configureUserPlatform } from './bootstrapUser';
import App from './App.jsx';
import './index.css';
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';

registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload();
  },
});

configureUserPlatform();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GeekSuiteApolloProvider appName="bujogeek">
      <App />
    </GeekSuiteApolloProvider>
  </React.StrictMode>,
);
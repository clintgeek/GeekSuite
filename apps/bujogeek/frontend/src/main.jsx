import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { configureUserPlatform } from './bootstrapUser';
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
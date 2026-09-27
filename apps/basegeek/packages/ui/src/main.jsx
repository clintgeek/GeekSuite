import React from 'react';
import ReactDOM from 'react-dom/client';
// The Signal Box type (theme.js): B612 is the Airbus cockpit face, Big
// Shoulders Stencil the plate lettering. Latin subsets only — this console
// has no other script to render, and each weight is a separate request.
import '@fontsource/b612/latin-400';
import '@fontsource/b612/latin-700';
import '@fontsource/b612-mono/latin-400';
import '@fontsource/b612-mono/latin-700';
import '@fontsource/big-shoulders-stencil-display/latin-800';
import App from './App';
import './index.css';

import { ApolloProvider } from '@apollo/client';
import { apolloClient } from './apolloClient';
import { configureUserPlatform } from './bootstrapUser';

// Before render: the shared user store's actions throw until it has an api
// instance, and `ThemeProvider` reads that store on its first commit.
configureUserPlatform();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ApolloProvider client={apolloClient}>
      <App />
    </ApolloProvider>
  </React.StrictMode>
);
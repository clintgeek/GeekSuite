import React from 'react';
import ReactDOM from 'react-dom/client';
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
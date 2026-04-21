import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApolloProvider } from '@apollo/client'
import { apolloClient } from './apolloClient'
import { configureUserPlatform } from './bootstrapUser'
import App from './App.jsx'
import AppBootstrapper from './AppBootstrapper.jsx'
import './index.css'

configureUserPlatform();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <AppBootstrapper>
        <App />
      </AppBootstrapper>
    </ApolloProvider>
  </StrictMode>,
)

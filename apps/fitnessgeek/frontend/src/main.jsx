import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Market Morning: Nunito, self-hosted (DOCS/SIMPLE_AND_FULL_PLAN.md). One
// rounded family for everything; the four weights the theme uses.
import '@fontsource/nunito/400.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import './index.css'
import App from './App.jsx'
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GeekSuiteApolloProvider appName="fitnessgeek">
      <App />
    </GeekSuiteApolloProvider>
  </StrictMode>,
)

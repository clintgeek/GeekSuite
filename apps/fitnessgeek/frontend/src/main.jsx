import { StrictMode } from 'react'
import { MotionConfig } from 'framer-motion'
import { createRoot } from 'react-dom/client'
// The Label: Archivo, self-hosted. One grotesque family for everything.
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/archivo/700.css'
import '@fontsource/archivo/800.css'
import '@fontsource/archivo/900.css'
import './index.css'
import App from './App.jsx'
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Every framer-motion animation honours the OS "reduce motion" setting. */}
    <MotionConfig reducedMotion="user">
      <GeekSuiteApolloProvider appName="fitnessgeek">
        <App />
      </GeekSuiteApolloProvider>
    </MotionConfig>
  </StrictMode>,
)

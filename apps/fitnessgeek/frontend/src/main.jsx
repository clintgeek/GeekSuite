import { StrictMode } from 'react'
import { MotionConfig } from 'framer-motion'
import { createRoot } from 'react-dom/client'
// Daylight: Figtree, self-hosted. One family for everything.
import '@fontsource/figtree/400.css'
import '@fontsource/figtree/500.css'
import '@fontsource/figtree/600.css'
import '@fontsource/figtree/700.css'
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

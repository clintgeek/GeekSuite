import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './index.css'
import App from './App.jsx'
import { GeekSuiteApolloProvider } from '@geeksuite/api-client';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GeekSuiteApolloProvider>
      <App />
    </GeekSuiteApolloProvider>
  </StrictMode>,
)

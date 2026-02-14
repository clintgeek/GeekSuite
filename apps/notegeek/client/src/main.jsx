import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Import ReactFlow styles
import 'reactflow/dist/style.css';

// Import custom SASS styles
import './styles/main.scss';

import './index.css'
import { configureUserPlatform } from './bootstrapUser'
import App from './App.jsx'
import AppBootstrapper from './AppBootstrapper.jsx'
import ThemeModeProvider from './theme/ThemeModeProvider.jsx'

configureUserPlatform();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeModeProvider>
      <AppBootstrapper>
        <App />
      </AppBootstrapper>
    </ThemeModeProvider>
  </StrictMode>,
)

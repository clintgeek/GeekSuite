import React from 'react';
import ReactDOM from 'react-dom/client';
import { configureUserPlatform } from './bootstrapUser';
import App from './App.jsx';
import './index.css';

configureUserPlatform();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
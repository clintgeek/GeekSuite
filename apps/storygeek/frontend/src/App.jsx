import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { ApolloProvider } from '@apollo/client';
import { AuthProvider, useAuth } from '@geeksuite/auth';
import { FocusModeProvider } from '@geeksuite/ui';
import apolloClient from './apolloClient';
import createStoryTheme from './theme/theme';

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import StoryList from './pages/StoryList';
import StoryCreation from './pages/StoryCreation';
import StoryPlay from './pages/StoryPlay';
import CharacterSheet from './pages/CharacterSheet';
import Settings from './pages/Settings';

function AppShell() {
  const { isAuthenticated, loading } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('storyGeek-theme') === 'dark') setIsDarkMode(true);
  }, []);

  const handleThemeToggle = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    localStorage.setItem('storyGeek-theme', next ? 'dark' : 'light');
  };

  const theme = React.useMemo(() => createStoryTheme(isDarkMode ? 'dark' : 'light'), [isDarkMode]);

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <CircularProgress />
        </Box>
      </ThemeProvider>
    );
  }

  const authed = (page) =>
    isAuthenticated
      ? <Layout onThemeToggle={handleThemeToggle} isDarkMode={isDarkMode}>{page}</Layout>
      : <Navigate to="/login" replace />;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <FocusModeProvider storageKey="storygeek.focusMode">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={authed(<StoryList />)} />
            <Route path="/create" element={authed(<StoryCreation />)} />
            <Route path="/play/:storyId" element={authed(<StoryPlay />)} />
            <Route path="/characters/:storyId" element={authed(<CharacterSheet />)} />
            <Route path="/settings" element={authed(<Settings />)} />
            <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
          </Routes>
        </BrowserRouter>
      </FocusModeProvider>
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <AuthProvider appName="storygeek">
        <AppShell />
      </AuthProvider>
    </ApolloProvider>
  );
}

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { ApolloProvider } from '@apollo/client';
import { AuthProvider, useAuth } from '@geeksuite/auth';
import { FocusModeProvider } from '@geeksuite/ui';
import { ThemeProvider, useThemeMode } from '@geeksuite/user';
import apolloClient from './apolloClient';
import { createStoryTheme } from './theme/theme';

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import StoryList from './pages/StoryList';
import StoryCreation from './pages/StoryCreation';
import StoryPlay from './pages/StoryPlay';
import CharacterSheet from './pages/CharacterSheet';
import Settings from './pages/Settings';

function AppShell() {
  const { isAuthenticated, loading } = useAuth();
  // Suite-wide theme preference (shared `geek_theme` cookie + user prefs).
  // The toggle itself lives in the top bar, which reads `useThemeMode` too.
  const { theme: mode } = useThemeMode();

  const theme = React.useMemo(() => createStoryTheme(mode), [mode]);

  if (loading) {
    return (
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
          <CircularProgress />
        </Box>
      </MuiThemeProvider>
    );
  }

  // `fill` hands the page the frame rather than the document flow — the play
  // surface fills it with flex instead of guessing at the chrome height.
  const authed = (page, layoutProps) =>
    isAuthenticated
      ? <Layout {...layoutProps}>{page}</Layout>
      : <Navigate to="/login" replace />;

  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      <FocusModeProvider storageKey="storygeek.focusMode">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={authed(<StoryList />)} />
            <Route path="/create" element={authed(<StoryCreation />)} />
            <Route path="/play/:storyId" element={authed(<StoryPlay />, { fill: true })} />
            <Route path="/characters/:storyId" element={authed(<CharacterSheet />)} />
            <Route path="/settings" element={authed(<Settings />)} />
            <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
          </Routes>
        </BrowserRouter>
      </FocusModeProvider>
    </MuiThemeProvider>
  );
}

export default function App() {
  return (
    <ApolloProvider client={apolloClient}>
      <AuthProvider appName="storygeek">
        <ThemeProvider>
          <AppShell />
        </ThemeProvider>
      </AuthProvider>
    </ApolloProvider>
  );
}

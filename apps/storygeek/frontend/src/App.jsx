import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, CircularProgress } from '@mui/material';
import { AuthProvider, useAuth } from '@geeksuite/auth';
import { FocusModeProvider, GeekUpdateIndicator } from '@geeksuite/ui';
import { ThemeProvider, useThemeMode } from '@geeksuite/user';
import { createStoryTheme } from './theme/theme';

import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import StoryList from './pages/StoryList';
import StoryCreation from './pages/StoryCreation';
import StoryPlay from './pages/StoryPlay';
import Settings from './pages/Settings';
import RecentlyDeleted from './pages/RecentlyDeleted';

/** `/characters/:id` (an old link to the retired codex placeholder) → the table. */
function CharactersRedirect() {
  const { storyId } = useParams();
  return <Navigate to={`/play/${storyId}`} replace />;
}

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
        <GeekUpdateIndicator />
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
      {/* PWA_STANDARD rule 9: "Updating…" during the post-deploy reload. */}
      <GeekUpdateIndicator />
      <FocusModeProvider storageKey="storygeek.focusMode">
        <BrowserRouter>
          <Routes>
            {/* Already-authenticated visits bounce home instead of showing the form. */}
            <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
            <Route path="/" element={authed(<StoryList />)} />
            <Route path="/create" element={authed(<StoryCreation />)} />
            <Route path="/play/:storyId" element={authed(<StoryPlay />, { fill: true })} />
            {/* The Character Codex was a placeholder; the cast lives on the
                play screen's Party panel. Old links land at the table. */}
            <Route path="/characters/:storyId" element={<CharactersRedirect />} />
            <Route path="/settings" element={authed(<Settings />)} />
            <Route path="/deleted" element={authed(<RecentlyDeleted />)} />
            <Route path="*" element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />} />
          </Routes>
        </BrowserRouter>
      </FocusModeProvider>
    </MuiThemeProvider>
  );
}

export default function App() {
  return (
    <AuthProvider appName="storygeek">
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </AuthProvider>
  );
}

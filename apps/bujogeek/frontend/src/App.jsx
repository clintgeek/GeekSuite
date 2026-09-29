import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider } from './context/TaskContext.jsx';
import { PenProvider, usePen } from './context/PenContext.jsx';
import AppBootstrapper from './AppBootstrapper.jsx';
import { createBuJoTheme } from './theme/theme';
import { ThemeProvider, useThemeMode } from './context/ThemeContext';
import { FocusModeProvider } from '@geeksuite/ui';
import AppShell from './components/layout/AppShell';
import { RETIRED_PATHS } from './components/layout/navConfig';
import ProtectedRoute from './components/ProtectedRoute';
import HelpSheet from './components/pen/HelpSheet';
import { PenLoading } from './components/pen/PenPage';
import useGlobalShortcuts from './hooks/useGlobalShortcuts';
import { Box } from '@mui/material';
import { lazy, Suspense, useMemo, useEffect } from 'react';

/**
 * BuJoGeek, Phase 1 "stupid simple" (DOCS/SIMPLE_PLAN.md): Today, Upcoming,
 * Done, and Search. Every page is a `React.lazy` boundary (DOCS/CONTEXT.md §
 * Bundle).
 */
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const TodayPage = lazy(() => import('./pages/TodayPage'));
const UpcomingPage = lazy(() => import('./pages/UpcomingPage'));
const DonePage = lazy(() => import('./pages/DonePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));

const RouteFallback = () => (
  <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 4, sm: 6 } }}>
    <PenLoading />
  </Box>
);

/** Routes and the app-wide keys; inside the providers they read. */
export function PenRoutes({ user, loading }) {
  const { helpOpen, setHelpOpen } = usePen();
  useGlobalShortcuts();

  useEffect(() => {
    const onKey = (event) => {
      const tag = event.target.tagName;
      if (
        event.key === '?' &&
        tag !== 'INPUT' &&
        tag !== 'TEXTAREA' &&
        !event.target.isContentEditable &&
        !event.target.closest('[role="dialog"]')
      ) {
        event.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [setHelpOpen]);

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/today" replace /> : <LoginPage />} />
          <Route path="/register" element={user ? <Navigate to="/today" replace /> : <RegisterPage />} />
          <Route path="/" element={loading ? null : <Navigate to={user ? '/today' : '/login'} replace />} />

          <Route path="/today" element={<ProtectedRoute><TodayPage /></ProtectedRoute>} />
          <Route path="/upcoming" element={<ProtectedRoute><UpcomingPage /></ProtectedRoute>} />
          <Route path="/done" element={<ProtectedRoute><DonePage /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />

          {RETIRED_PATHS.map((path) => (
            <Route key={path} path={path} element={<Navigate to="/today" replace />} />
          ))}

          <Route path="*" element={loading ? null : <Navigate to={user ? '/today' : '/login'} replace />} />
        </Routes>
      </Suspense>
      {user && <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />}
    </>
  );
}

function AppWithAuth() {
  const { user, loading } = useAuth();
  return (
    <AppShell>
      <PenProvider>
        <PenRoutes user={user} loading={loading} />
      </PenProvider>
    </AppShell>
  );
}

function AppContent() {
  const { theme } = useThemeMode();
  const muiTheme = useMemo(() => createBuJoTheme(theme), [theme]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      <AuthProvider>
        <AppBootstrapper>
          <TaskProvider>
            <Router>
              <AppWithAuth />
            </Router>
          </TaskProvider>
        </AppBootstrapper>
      </AuthProvider>
    </MuiThemeProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <FocusModeProvider storageKey="bujogeek.focusMode">
        <AppContent />
      </FocusModeProvider>
    </ThemeProvider>
  );
}

export default App;

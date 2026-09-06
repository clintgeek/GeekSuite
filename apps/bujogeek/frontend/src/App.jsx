import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider } from './context/TaskContext.jsx';
import AppBootstrapper from './AppBootstrapper.jsx';
import { createBuJoTheme } from './theme/theme';
import { ThemeProvider, useThemeMode } from './context/ThemeContext';
import { FocusModeProvider } from '@geeksuite/ui';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import KeyboardHelp from './components/shared/KeyboardHelp';
import SkeletonLoader from './components/shared/SkeletonLoader';
import { Box } from '@mui/material';
import { lazy, Suspense, useMemo, useState, useEffect } from 'react';

/**
 * Every page is a `React.lazy` boundary.
 *
 * Before this the twelve pages, their sections, editors, dialogs and the
 * markdown/date-picker tails behind them were all in the entry chunk — one
 * 1605 kB script for a planner whose first screen is a list of today's tasks.
 * Splitting at the route is the whole win; see `DOCS/CONTEXT.md` § Bundle.
 *
 * Nothing here changes what a route renders. The only visible difference is
 * that a first visit to a route paints `RouteFallback` for the length of one
 * chunk fetch — the same parchment shimmer the pages themselves show while
 * their data loads, so the transition reads as one continuous load rather than
 * a spinner handing off to a skeleton.
 */
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const TodayPage = lazy(() => import('./pages/TodayPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const PlanPage = lazy(() => import('./pages/PlanPage'));
const TemplatesPage = lazy(() => import('./pages/TemplatesPage'));
const TagsPage = lazy(() => import('./pages/TagsPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));
const HabitsPage = lazy(() => import('./pages/HabitsPage'));
const CollectionDetailPage = lazy(() => import('./pages/CollectionDetailPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

/**
 * RouteFallback — the surface a route chunk loads into.
 *
 * Deliberately NOT a centred CircularProgress: every page in this app already
 * loads into `SkeletonLoader`'s warm parchment shimmer, at the same 720px
 * measure and the same gutters, so reusing it keeps the paper-journal skin
 * unbroken and stops the layout jumping when the real page arrives.
 */
const RouteFallback = () => (
  <Box sx={{ maxWidth: 720, mx: 'auto', px: { xs: 1, sm: 3 }, pt: 4, pb: { xs: 11, md: 4 } }}>
    <SkeletonLoader rows={6} />
  </Box>
);

function AppWithAuth() {
  const { user, loading } = useAuth();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const handleKeyPress = (event) => {
      // ? → keyboard help (only when not typing)
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

    window.addEventListener('keydown', handleKeyPress, true);
    return () => window.removeEventListener('keydown', handleKeyPress, true);
  }, []);

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Auth routes — redirect to /today if already authenticated */}
          <Route path="/login" element={user ? <Navigate to="/today" replace /> : <LoginPage />} />
          <Route path="/register" element={user ? <Navigate to="/today" replace /> : <RegisterPage />} />

          {/* Default redirect */}
          <Route path="/" element={loading ? null : <Navigate to={user ? '/today' : '/login'} replace />} />

          {/* Primary views */}
          <Route path="/today" element={<ProtectedRoute><TodayPage /></ProtectedRoute>} />
          <Route path="/review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
          <Route path="/plan" element={<ProtectedRoute><PlanPage /></ProtectedRoute>} />
          <Route path="/plan/:subview" element={<ProtectedRoute><PlanPage /></ProtectedRoute>} />
          <Route path="/templates" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
          <Route path="/templates/*" element={<ProtectedRoute><TemplatesPage /></ProtectedRoute>} />
          <Route path="/tags" element={<ProtectedRoute><TagsPage /></ProtectedRoute>} />
          <Route path="/collections" element={<ProtectedRoute><CollectionsPage /></ProtectedRoute>} />
          <Route path="/collections/:id" element={<ProtectedRoute><CollectionDetailPage /></ProtectedRoute>} />
          <Route path="/habits" element={<ProtectedRoute><HabitsPage /></ProtectedRoute>} />
          <Route path="/search" element={<ProtectedRoute><SearchPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          {/* Legacy redirects */}
          <Route path="/tasks/daily" element={<Navigate to="/today" replace />} />
          <Route path="/tasks/weekly" element={<Navigate to="/plan/weekly" replace />} />
          <Route path="/tasks/monthly" element={<Navigate to="/plan/monthly" replace />} />
          <Route path="/tasks/year" element={<Navigate to="/plan/monthly" replace />} />
          <Route path="/tasks/all" element={<Navigate to="/plan/backlog" replace />} />
          <Route path="/tasks/*" element={<Navigate to="/today" replace />} />

          {/* Catch-all */}
          <Route path="*" element={loading ? null : <Navigate to={user ? '/today' : '/login'} replace />} />
        </Routes>
      </Suspense>

      {user && (
        <KeyboardHelp
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </AppShell>
  );
}

function AppContent() {
  const { theme } = useThemeMode();
  const muiTheme = useMemo(() => createBuJoTheme(theme), [theme]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <AuthProvider>
          <AppBootstrapper>
            <TaskProvider>
              <Router>
                <AppWithAuth />
              </Router>
            </TaskProvider>
          </AppBootstrapper>
        </AuthProvider>
      </LocalizationProvider>
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
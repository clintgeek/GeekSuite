import React, { useMemo, lazy, Suspense } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { FocusModeProvider } from '@geeksuite/ui';
import { createAppTheme } from './theme/theme';

// Import components that are needed immediately
import Layout from './components/Layout/ModernLayout.jsx';
import RedirectWithQuery from './components/Layout/RedirectWithQuery.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import OfflineIndicator from './components/OfflineIndicator/OfflineIndicator.jsx';
import PWAUpdatePrompt from './components/PWAUpdatePrompt.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Lazy load pages for code splitting
const Today = lazy(() => import('./pages/Today.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const FoodSearch = lazy(() => import('./pages/FoodSearch.jsx'));
const Weight = lazy(() => import('./pages/Weight.jsx'));
const BloodPressure = lazy(() => import('./pages/BloodPressure.jsx'));
const Medications = lazy(() => import('./pages/Medications.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Trends = lazy(() => import('./pages/Trends.jsx'));
const SavedFoods = lazy(() => import('./pages/SavedFoods.jsx'));
const AIGoalPlanner = lazy(() => import('./components/FitnessGoals/AIGoalPlanner.jsx'));
const ScanImport = lazy(() => import('./pages/ScanImport.jsx'));
const More = lazy(() => import('./pages/More.jsx'));

// Import contexts
import { AuthProvider, useAuth } from '@geeksuite/auth';
import AuthListener from './components/AuthListener.jsx';
import { SettingsProvider } from './contexts/SettingsContext.jsx';
import { ExperienceProvider } from './contexts/ExperienceContext.jsx';
import { ThemeProvider, useThemeMode as useTheme } from '@geeksuite/user';

// Loading component for Suspense fallback
const LoadingFallback = () => (
  <Box sx={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh'
  }}>
    <CircularProgress />
  </Box>
);

// "Something went wrong — Reload" instead of a white screen (review 0.16).
// Keyed on the path so the nav gets a fresh try without a full reload.
function RoutedErrorBoundary({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

// Auth-gated route table. A separate component (rather than inline JSX in
// AppContent) because it needs `useAuth()`, and hooks only see the context
// a component's *tree* position provides — AppContent renders <AuthProvider>
// as a wrapper, so it sits above that context, not inside it.
function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  // Already-authenticated (or still-resolving) visits to /login or
  // /register redirect/hold instead of flashing the splash or form.
  const publicRouteElement = (page) => {
    if (loading) return <LoadingFallback />;
    if (isAuthenticated) return <Navigate to="/dashboard" replace />;
    return page;
  };

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={publicRouteElement(<Login />)} />
      <Route path="/register" element={publicRouteElement(<Register />)} />

      {/* Protected routes */}
      <Route path="/" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        {/* Today: the day's food, and what is left (DOCS/ONE_APP_PLAN.md §1).
            It was Home and Food log; /food-log lands on it with its query
            (?date=, ?meal=, ?add=), so old links and shortcuts still work. */}
        <Route path="dashboard" element={<Today />} />
        <Route path="food-log" element={<RedirectWithQuery to="/dashboard" />} />
        <Route path="food-search" element={<FoodSearch />} />
        <Route path="weight" element={<Weight />} />
        <Route path="blood-pressure" element={<BloodPressure />} />
        <Route path="medications" element={<Medications />} />
        {/* Trends: Food (was Reports), Activity, Health (was the Health
            dashboard), as tabs. The old addresses open the matching tab. */}
        <Route path="trends" element={<Trends />} />
        <Route path="reports" element={<RedirectWithQuery to="/trends" params={{ tab: 'food' }} />} />
        <Route path="activity" element={<RedirectWithQuery to="/trends" params={{ tab: 'activity' }} />} />
        <Route path="health" element={<RedirectWithQuery to="/trends" params={{ tab: 'health' }} />} />
        {/* Saved foods: Meals (was My meals) and Foods (was My foods). */}
        <Route path="saved-foods" element={<SavedFoods />} />
        <Route path="my-meals" element={<RedirectWithQuery to="/saved-foods" params={{ tab: 'meals' }} />} />
        <Route path="my-foods" element={<RedirectWithQuery to="/saved-foods" params={{ tab: 'foods' }} />} />
        {/* Web Share Target lands here (see manifest.json's share_target.action
            and backend shareTargetController.js), plus the manual file-picker
            fallback for iOS/desktop/re-imports. */}
        <Route path="scan-import" element={<ScanImport />} />
        {/* Legacy goals route removed */}
        <Route path="calorie-wizard" element={<AIGoalPlanner />} />
        {/* Profile folded into Settings (UX review IA-2); old links and
            installed shortcuts land on its "About you" section. */}
        <Route path="profile" element={<Navigate to="/settings#you" replace />} />
        <Route path="settings" element={<Settings />} />
        {/* Everything the phone's tabs don't hold (ONE_APP_PLAN.md §3). */}
        <Route path="more" element={<More />} />
      </Route>

      {/* Catch all route */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

// Inner component that uses theme context
function AppContent() {
  const { theme: themeMode } = useTheme();
  const muiTheme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      <FocusModeProvider storageKey="fitnessgeek.focusMode">
        <OfflineIndicator />
        <PWAUpdatePrompt />
        <AuthProvider appName="fitnessgeek">
          <AuthListener />
          <SettingsProvider>
            {/* Larger text, the greeting's name, the first run — per person. */}
            <ExperienceProvider>
              <Router>
                <Box sx={{
                  minHeight: '100vh'
                }}>
                  <RoutedErrorBoundary>
                    <Suspense fallback={<LoadingFallback />}>
                      <AppRoutes />
                    </Suspense>
                  </RoutedErrorBoundary>
                </Box>
              </Router>
            </ExperienceProvider>
          </SettingsProvider>
        </AuthProvider>
      </FocusModeProvider>
    </MuiThemeProvider>
  );
}

// Main App wraps with ThemeProvider so AppContent can use useTheme
function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
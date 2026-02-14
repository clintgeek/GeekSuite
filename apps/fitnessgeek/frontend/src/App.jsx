import React, { useMemo, lazy, Suspense } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import { CssBaseline, Box, CircularProgress } from '@mui/material';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { createAppTheme } from './theme/theme';

// Import components that are needed immediately
import Layout from './components/Layout/ModernLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import OfflineIndicator from './components/OfflineIndicator/OfflineIndicator.jsx';
import PWAUpdatePrompt from './components/PWAUpdatePrompt.jsx';

// Lazy load pages for code splitting
const Dashboard = lazy(() => import('./pages/DashboardNew.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const FoodSearch = lazy(() => import('./pages/FoodSearch.jsx'));
const FoodLog = lazy(() => import('./pages/FoodLog.jsx'));
const MyFoods = lazy(() => import('./pages/MyFoods.jsx'));
const MyMeals = lazy(() => import('./pages/MyMeals.jsx'));
const Weight = lazy(() => import('./pages/Weight.jsx'));
const BloodPressure = lazy(() => import('./pages/BloodPressure.jsx'));
const Medications = lazy(() => import('./pages/Medications.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));
const Activity = lazy(() => import('./pages/Activity.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const AIGoalPlanner = lazy(() => import('./components/FitnessGoals/AIGoalPlanner.jsx'));
const HealthDashboard = lazy(() => import('./pages/HealthDashboard.jsx'));

// Import contexts
import { AuthProvider } from './contexts/AuthContext.jsx';
import { SettingsProvider } from './contexts/SettingsContext.jsx';
import { ThemeProvider, useTheme } from './contexts/ThemeContext.jsx';

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

// Inner component that uses theme context
function AppContent() {
  const { theme: themeMode } = useTheme();
  const muiTheme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  return (
    <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        <OfflineIndicator />
        <PWAUpdatePrompt />
        <AuthProvider>
          <SettingsProvider>
            <Router>
              <Box sx={{
                minHeight: '100vh'
              }}>
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                  {/* Public routes */}
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />

                {/* Protected routes */}
                <Route path="/" element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="food-search" element={<FoodSearch />} />
                  <Route path="food-log" element={<FoodLog />} />
                  <Route path="my-foods" element={<MyFoods />} />
                  <Route path="my-meals" element={<MyMeals />} />
                  <Route path="weight" element={<Weight />} />
                  <Route path="blood-pressure" element={<BloodPressure />} />
                  <Route path="medications" element={<Medications />} />
                  <Route path="activity" element={<Activity />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="health" element={<HealthDashboard />} />
                  {/* Legacy goals route removed */}
                  <Route path="calorie-wizard" element={<AIGoalPlanner />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="settings" element={<Settings />} />
                </Route>

                {/* Catch all route */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </Suspense>
              </Box>
            </Router>
          </SettingsProvider>
        </AuthProvider>
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
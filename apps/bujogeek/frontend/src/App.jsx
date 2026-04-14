import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline, ThemeProvider as MuiThemeProvider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider } from './context/TaskContext.jsx';
import AppBootstrapper from './AppBootstrapper.jsx';
import { createAppTheme } from './theme/theme';
import { ThemeProvider, useThemeMode } from './context/ThemeContext';
import { ToastProvider } from './components/shared/Toast';
import AppShell from './components/layout/AppShell';
import ProtectedRoute from './components/ProtectedRoute';
import KeyboardHelp from './components/shared/KeyboardHelp';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import TodayPage from './pages/TodayPage';
import ReviewPage from './pages/ReviewPage';
import PlanPage from './pages/PlanPage';
import TemplatesPage from './pages/TemplatesPage';
import TagsPage from './pages/TagsPage';
import { useMemo, useState, useEffect } from 'react';

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
  const muiTheme = useMemo(() => createAppTheme(theme), [theme]);

  return (
    <MuiThemeProvider theme={muiTheme}>
      <CssBaseline />
      <LocalizationProvider dateAdapter={AdapterDateFns}>
        <AuthProvider>
          <AppBootstrapper>
            <TaskProvider>
              <ToastProvider>
                <Router>
                  <AppWithAuth />
                </Router>
              </ToastProvider>
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
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
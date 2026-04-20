import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CssBaseline, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './theme';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Search from './pages/Search';
import Digest from './pages/Digest';

// Mono stack — matches theme but usable before ThemeProvider context
const monoStack = '"JetBrains Mono", "Geist Mono", ui-monospace, monospace';

function LoadingVeil() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 3,
        backgroundColor: 'background.default',
      }}
    >
      {/* Wordmark stamp */}
      <Box
        sx={{
          fontFamily: '"Geist", -apple-system, BlinkMacSystemFont, sans-serif',
          fontWeight: 700,
          fontSize: '1rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'text.primary',
          animation: 'rise 0.5s ease forwards',
        }}
      >
        DashGeek
      </Box>

      {/* Status caption */}
      <Typography
        variant="caption"
        sx={{
          color: 'text.disabled',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          animation: 'rise 0.5s ease 150ms forwards',
          opacity: 0,
        }}
      >
        Authenticating…
      </Typography>

      {/* Progress bar */}
      <Box
        sx={{
          width: 80,
          height: '1px',
          backgroundColor: 'divider',
          position: 'relative',
          overflow: 'hidden',
          '&::after': {
            content: '""',
            position: 'absolute',
            left: '-40%',
            top: 0,
            width: '40%',
            height: '100%',
            backgroundColor: 'primary.main',
            animation: 'shimmer 1.4s ease-in-out infinite',
          },
        }}
      />
      <style>{`
        @keyframes shimmer {
          0%   { left: -40%; }
          100% { left: 100%; }
        }
      `}</style>
    </Box>
  );
}

export default function App() {
  const { hydrateUser, isAuthenticated, isLoading } = useAuthStore();
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    hydrateUser()
      .catch(() => {})
      .finally(() => setIsHydrating(false));
  }, [hydrateUser]);

  const loading = isHydrating || isLoading;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        {loading ? (
          <LoadingVeil />
        ) : (
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/search"
              element={isAuthenticated ? <Search /> : <Navigate to="/login" replace />}
            />
            {/* /ai 301-style redirect → /digest (preserves bookmarks) */}
            <Route path="/ai" element={<Navigate to="/digest" replace />} />
            <Route
              path="/digest"
              element={isAuthenticated ? <Digest /> : <Navigate to="/login" replace />}
            />
            <Route
              path="*"
              element={<Navigate to={isAuthenticated ? '/' : '/login'} replace />}
            />
          </Routes>
        )}
      </Router>
    </ThemeProvider>
  );
}

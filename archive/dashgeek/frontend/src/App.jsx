import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CssBaseline, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from './theme';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Ambient from './pages/Ambient';
import Suite from './pages/Dashboard';
import Search from './pages/Search';
import Digest from './pages/Digest';
import Brand from './components/Brand';
import SwipeShell from './components/SwipeShell';

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

/**
 * DeskLayout — the shell chrome (Brand header + swipeable body).
 * Wraps the two swipe screens (`/`, `/suite`).
 */
function DeskLayout() {
  const { logout } = useAuthStore();
  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Brand onLogout={logout} />
      <SwipeShell>
        <Ambient />
        <Suite />
      </SwipeShell>
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

            {/* Swipe shell — shared chrome for / and /suite */}
            <Route
              path="/"
              element={isAuthenticated ? <DeskLayout /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/suite"
              element={isAuthenticated ? <DeskLayout /> : <Navigate to="/login" replace />}
            />

            {/* Standalone routes */}
            <Route
              path="/search"
              element={isAuthenticated ? <Search /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/digest"
              element={isAuthenticated ? <Digest /> : <Navigate to="/login" replace />}
            />

            {/* /ai 301-style redirect → /digest (preserves bookmarks) */}
            <Route path="/ai" element={<Navigate to="/digest" replace />} />

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

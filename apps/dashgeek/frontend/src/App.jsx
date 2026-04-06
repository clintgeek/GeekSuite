import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Box, CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { theme, tokens } from './theme';
import useAuthStore from './store/authStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Search from './pages/Search';
import AI from './pages/AI';

function LoadingVeil() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 4,
      }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          border: `1px solid ${tokens.brass}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: tokens.fontDisplay,
          fontStyle: 'italic',
          fontSize: '1.3rem',
          color: tokens.brass,
          animation: 'rise 0.6s var(--ease) forwards',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 3,
            border: `1px solid ${tokens.brass}`,
            opacity: 0.35,
          },
        }}
      >
        D
      </Box>
      <Box
        sx={{
          fontFamily: tokens.fontMono,
          fontSize: '0.55rem',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: tokens.boneFaint,
          animation: 'rise 0.6s var(--ease) 200ms forwards',
          opacity: 0,
        }}
      >
        Authenticating…
      </Box>
      <Box
        sx={{
          width: 120,
          height: '1px',
          background: tokens.boneGhost,
          position: 'relative',
          overflow: 'hidden',
          '&::after': {
            content: '""',
            position: 'absolute',
            left: '-30%',
            top: 0,
            width: '30%',
            height: '100%',
            background: tokens.brass,
            animation: 'shimmer 1.5s ease-in-out infinite',
          },
        }}
      />
      <style>{`
        @keyframes shimmer {
          0% { left: -30%; }
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
            <Route
              path="/ai"
              element={isAuthenticated ? <AI /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/digest"
              element={isAuthenticated ? <AI /> : <Navigate to="/login" replace />}
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

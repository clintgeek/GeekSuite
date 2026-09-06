import { useState, useEffect } from 'react';
import { Box, TextField, Button, Typography, Alert, Tabs, Tab, useTheme, CircularProgress } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import { alpha } from '@mui/material/styles';
import api from '../api';
import { useBaseGeekAuth } from '../components/AuthContext';
import { safeRedirect } from '../utils/safeRedirect';

export default function LoginPage() {
  const theme = useTheme();
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({ identifier: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useBaseGeekAuth();

  const params = new URLSearchParams(location.search);
  const redirectUrl = params.get('redirect') || '/';
  const app = params.get('app') || 'basegeek';

  const [appInfo, setAppInfo] = useState(null);
  useEffect(() => {
    if (app && app !== 'basegeek') {
      setAppInfo({ name: app.charAt(0).toUpperCase() + app.slice(1) });
    }
  }, [app]);

  // Already signed in (basegeek's cookie is suite-wide, so a visit to /login
  // from another app's loginRedirect() often lands here with a live session
  // already resolved). Bounce straight back rather than showing the form.
  useEffect(() => {
    if (!authLoading && user) {
      window.location.href = safeRedirect(redirectUrl);
    }
  }, [authLoading, user, redirectUrl]);

  if (authLoading || user) {
    return (
      <Box sx={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        minHeight: '100vh', '@supports (height: 100dvh)': { minHeight: '100dvh' },
        backgroundColor: theme.palette.surfaces.deep,
      }}>
        <CircularProgress />
      </Box>
    );
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (tab === 0) {
        await api.post('/auth/login', { identifier: form.identifier, password: form.password, app });
      } else {
        await api.post('/auth/register', { username: form.identifier, email: form.email, password: form.password, app });
      }
      window.location.href = safeRedirect(redirectUrl);
    } catch (err) {
      const code = err.response?.data?.error || err.response?.data?.code;
      if (err.response?.status === 403 && String(code).startsWith('csrf_token')) {
        // The client already retried and reloaded once (see api.js); if we
        // are still here, the cached bundle is stale beyond self-heal.
        setError('This page is out of date. Reload it (hold Shift) and try again.');
      } else {
        setError(err.response?.data?.message || 'Authentication failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      '@supports (height: 100dvh)': { minHeight: '100dvh' },
      backgroundColor: theme.palette.surfaces.deep,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient glow */}
      <Box sx={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '600px',
        height: '400px',
        background: `radial-gradient(ellipse, ${theme.palette.glow.soft} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <Box sx={{
        width: '100%',
        maxWidth: 380,
        mx: 2,
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Brand */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box sx={{
            width: 56,
            height: 56,
            borderRadius: '14px',
            background: theme.palette.accent.gradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 700,
            color: theme.palette.accent.onBrightFill,
            fontFamily: '"Geist Mono", monospace',
            mx: 'auto',
            mb: 2,
            boxShadow: `0 8px 32px ${alpha(theme.palette.primary.main, 0.15)}`,
          }}>
            bg
          </Box>
          <Typography sx={{
            fontWeight: 700,
            fontSize: '1.5rem',
            color: 'text.primary',
            letterSpacing: '-0.02em',
            mb: 0.25,
          }}>
            baseGeek
          </Typography>
          <Typography sx={{
            fontSize: '0.75rem',
            color: 'text.secondary',
            fontFamily: '"Geist Mono", monospace',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            mission control
          </Typography>
        </Box>

        {/* Card */}
        <Box sx={{
          backgroundColor: 'background.paper',
          borderRadius: '16px',
          border: `1px solid ${theme.palette.line.panel}`,
          p: 3.5,
        }}>
          {appInfo && (
            <Alert severity="info" sx={{ mb: 2.5, fontSize: '0.8rem' }}>
              Signing in via baseGeek to access {appInfo.name}
            </Alert>
          )}

          {!appInfo && (
            <Typography sx={{
              color: 'text.secondary',
              fontSize: '0.85rem',
              textAlign: 'center',
              mb: 2.5,
            }}>
              Sign in to your GeekSuite account
            </Typography>
          )}

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            centered
            sx={{
              mb: 2.5,
              minHeight: 36,
              '& .MuiTab-root': {
                minHeight: 36,
                py: 0.75,
                fontSize: '0.8rem',
              },
            }}
          >
            <Tab label="Sign in" />
            <Tab label="Register" />
          </Tabs>

          <form onSubmit={handleSubmit}>
            <TextField
              label="Username or email"
              name="identifier"
              value={form.identifier}
              onChange={handleChange}
              fullWidth
              margin="dense"
              required
              autoFocus
              size="small"
            />
            {tab === 1 && (
              <TextField
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                fullWidth
                margin="dense"
                required
                size="small"
              />
            )}
            <TextField
              label="Password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              fullWidth
              margin="dense"
              required
              size="small"
            />
            {error && <Alert severity="error" sx={{ mt: 1.5, fontSize: '0.8rem' }}>{error}</Alert>}
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              disabled={isLoading}
              sx={{
                mt: 2.5,
                py: 1.25,
                fontWeight: 600,
                fontSize: '0.875rem',
                borderRadius: '10px',
              }}
            >
              {isLoading ? 'Working...' : tab === 0 ? 'Sign in' : 'Create account'}
            </Button>
          </form>
        </Box>

        {/* Footer */}
        <Typography sx={{
          textAlign: 'center',
          mt: 3,
          fontSize: '0.75rem',
          color: 'text.muted',
          fontFamily: '"Geist Mono", monospace',
        }}>
          GeekSuite — shared authentication
        </Typography>
      </Box>
    </Box>
  );
}
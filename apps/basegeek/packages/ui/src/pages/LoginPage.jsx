import { useState, useEffect } from 'react';
import { Box, TextField, Button, Typography, Alert, Tabs, Tab } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore.js';

export default function LoginPage() {
  const [tab, setTab] = useState(0);
  const [form, setForm] = useState({ identifier: '', email: '', password: '' });
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, error, isLoading } = useSharedAuthStore();

  const params = new URLSearchParams(location.search);
  const redirectUrl = params.get('redirect') || '/';
  const callbackUrl = params.get('callback') || null;
  const app = params.get('app') || 'basegeek';
  const state = params.get('state') || null;

  console.log('LoginPage initialized with:', {
    redirectUrl,
    callbackUrl: callbackUrl ? decodeURIComponent(callbackUrl) : null,
    app,
    state
  });

  const [appInfo, setAppInfo] = useState(null);
  useEffect(() => {
    if (app && app !== 'basegeek') {
      setAppInfo({
        name: app.charAt(0).toUpperCase() + app.slice(1),
        description: `Sign in to access ${app.charAt(0).toUpperCase() + app.slice(1)}`
      });
    }
  }, [app]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let result;

      if (tab === 0) {
        console.log('Login attempt:', form.identifier, form.password, app);
        result = await login(form.identifier, form.password, app);
      } else {
        console.log('Register attempt:', form.identifier, form.email, form.password, app);
        result = await register(form.identifier, form.email, form.password, app);
      }

      console.log('Auth result:', result);

      if (result && result.token) {
        console.log('Authentication successful, token received');

        if (callbackUrl) {
          const decodedCallbackUrl = decodeURIComponent(callbackUrl);
          console.log('Decoded callback URL:', decodedCallbackUrl);

          try {
            const url = new URL(decodedCallbackUrl);
            url.searchParams.set('token', result.token);

            if (result.refreshToken) {
              url.searchParams.set('refreshToken', result.refreshToken);
            }

            url.searchParams.set('app', app);

            if (state) {
              url.searchParams.set('state', state);
            }

            console.log('Redirecting to callback URL:', url.toString());
            window.location.href = url.toString();
          } catch (urlError) {
            console.error('Invalid callback URL:', decodedCallbackUrl, urlError);
            alert('Invalid callback URL. Please try again.');
          }
        } else if (redirectUrl && redirectUrl !== '/') {
          const url = new URL(decodeURIComponent(redirectUrl));
          console.log('Redirecting to custom URL:', url.toString());
          window.location.href = url.toString();
        } else {
          navigate('/');
        }
      } else {
        console.warn('No token in auth result:', result);
        alert('Authentication failed. Please try again.');
      }
    } catch (err) {
      console.error('Form submission error:', err);
      alert('Auth error: ' + (err?.message || err));
    }
  };

  return (
    <Box sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#0c0c0f',
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
        background: 'radial-gradient(ellipse, rgba(232, 168, 73, 0.06) 0%, transparent 70%)',
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
            background: 'linear-gradient(135deg, #e8a849 0%, #d4956a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            fontWeight: 700,
            color: '#0c0c0f',
            fontFamily: '"Geist Mono", monospace',
            mx: 'auto',
            mb: 2,
            boxShadow: '0 8px 32px rgba(232, 168, 73, 0.15)',
          }}>
            bg
          </Box>
          <Typography sx={{
            fontWeight: 700,
            fontSize: '1.5rem',
            color: '#e4dfd6',
            letterSpacing: '-0.02em',
            mb: 0.25,
          }}>
            baseGeek
          </Typography>
          <Typography sx={{
            fontSize: '0.7rem',
            color: '#52525a',
            fontFamily: '"Geist Mono", monospace',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            mission control
          </Typography>
        </Box>

        {/* Card */}
        <Box sx={{
          backgroundColor: '#17171b',
          borderRadius: '16px',
          border: '1px solid #252529',
          p: 3.5,
        }}>
          {appInfo && (
            <Alert severity="info" sx={{ mb: 2.5, fontSize: '0.8rem' }}>
              Signing in via baseGeek to access {appInfo.name}
            </Alert>
          )}

          {!appInfo && (
            <Typography sx={{
              color: '#8a8690',
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
          fontSize: '0.7rem',
          color: '#3a3a40',
          fontFamily: '"Geist Mono", monospace',
        }}>
          GeekSuite — shared authentication
        </Typography>
      </Box>
    </Box>
  );
}
import { useState, useEffect, useMemo } from 'react';
import { Box, Paper, Tabs, Tab, TextField, Button, Typography, Alert, Divider } from '@mui/material';
import AutoStoriesIcon from '@mui/icons-material/AutoStories';
import { useNavigate, useLocation } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore.js';

const rawCallbackAllowList = import.meta.env.VITE_SSO_CALLBACK_ALLOWLIST || '';
const callbackAllowList = rawCallbackAllowList
  .split(',')
  .map(entry => entry.trim())
  .filter(Boolean);

const isCallbackAllowed = (urlString) => {
  if (!urlString || callbackAllowList.length === 0) {
    return true;
  }

  try {
    const targetUrl = new URL(urlString);
    const targetOrigin = targetUrl.origin.toLowerCase();
    const targetHost = targetUrl.hostname.toLowerCase();

    return callbackAllowList.some(entry => {
      try {
        const parsed = new URL(entry);
        return parsed.origin.toLowerCase() === targetOrigin;
      } catch {
        const normalizedEntry = entry.toLowerCase();
        return targetHost === normalizedEntry || targetHost.endsWith(`.${normalizedEntry}`);
      }
    });
  } catch {
    return false;
  }
};

export default function LoginPage() {
  const [tab, setTab] = useState(0); // 0 = Login, 1 = Register
  const [form, setForm] = useState({ identifier: '', email: '', password: '' });
  const [ssoError, setSsoError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, error, isLoading } = useSharedAuthStore();

  // Get parameters from query string
  const params = new URLSearchParams(location.search);
  const redirectUrl = params.get('redirect') || '/';
  const callbackUrl = params.get('callback') || null;
  const app = params.get('app') || 'storygeek';
  const state = params.get('state') || null;

  const decodedCallbackUrl = useMemo(() => {
    if (!callbackUrl) return null;
    try {
      return decodeURIComponent(callbackUrl);
    } catch {
      return null;
    }
  }, [callbackUrl]);

  useEffect(() => {
    if (!decodedCallbackUrl) {
      setSsoError('');
      return;
    }

    if (!isCallbackAllowed(decodedCallbackUrl)) {
      setSsoError('The requested callback URL is not on the allowed list for StoryGeek SSO.');
    } else {
      setSsoError('');
    }
  }, [decodedCallbackUrl]);

  console.log('LoginPage initialized with:', {
    redirectUrl,
    callbackUrl: decodedCallbackUrl,
    app,
    state
  });

  // Display app info when available
  const [appInfo, setAppInfo] = useState(null);
  useEffect(() => {
    if (app && app !== 'storygeek') {
      // Here you could fetch app info from API if needed
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
        // Login
        console.log('Login attempt:', form.identifier, form.password, app);
        result = await login(form.identifier, form.password, app);
      } else {
        // Register
        console.log('Register attempt:', form.identifier, form.email, form.password, app);
        result = await register(form.identifier, form.email, form.password, app);
      }

      console.log('Auth result:', result);

      if (result && result.token) {
        console.log('Authentication successful, token received');

        // Handle redirection based on parameters
        if (decodedCallbackUrl) {
          if (!isCallbackAllowed(decodedCallbackUrl)) {
            setSsoError('The requested callback URL is not allowed.');
            alert('Callback URL is not allowed for StoryGeek SSO.');
            return;
          }

          console.log('Decoded callback URL:', decodedCallbackUrl);

          // SSO flow - redirect to the callback URL with tokens
          try {
            const url = new URL(decodedCallbackUrl);

            // Add token parameters
            url.searchParams.set('token', result.token);

            if (result.refreshToken) {
              url.searchParams.set('refreshToken', result.refreshToken);
            }

            url.searchParams.set('app', app);

            // Add state parameter for CSRF protection if provided
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
          // Custom redirect URL without SSO
          const url = new URL(decodeURIComponent(redirectUrl));
          console.log('Redirecting to custom URL:', url.toString());
          window.location.href = url.toString();
        } else {
          // Default redirect to dashboard
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
    <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" bgcolor="background.default">
      <Paper elevation={4} sx={{ p: 4, minWidth: 350, maxWidth: 400, borderRadius: 3 }}>
        <Box display="flex" flexDirection="column" alignItems="center" mb={2}>
          <AutoStoriesIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            StoryGeek
            <Typography component="span" sx={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: 'bold', ml: 0.5, mt: 0.5 }}>{'</>'}</Typography>
          </Typography>

          {appInfo ? (
            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
              {appInfo.description}
            </Typography>
          ) : (
            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
              Welcome to AI-powered storytelling
            </Typography>
          )}
        </Box>

        {app !== 'storygeek' && (
          <Alert severity="info" sx={{ mb: 2 }}>
            You're signing in via StoryGeek to access {app.charAt(0).toUpperCase() + app.slice(1)}
          </Alert>
        )}

        {ssoError && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {ssoError}
          </Alert>
        )}

        <Divider sx={{ mb: 2 }} />
        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered sx={{ mb: 2 }}>
          <Tab label="Login" />
          <Tab label="Register" />
        </Tabs>
        <form onSubmit={handleSubmit}>
          <TextField
            label="Username or Email"
            name="identifier"
            value={form.identifier}
            onChange={handleChange}
            fullWidth
            margin="normal"
            required
            autoFocus
          />
          {tab === 1 && (
            <TextField
              label="Email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              fullWidth
              margin="normal"
              required
            />
          )}
          <TextField
            label="Password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            fullWidth
            margin="normal"
            required
          />
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            sx={{ mt: 3, fontWeight: 'bold', fontSize: 16 }}
            disabled={isLoading || Boolean(ssoError)}
          >
            {tab === 0 ? 'Login' : 'Register'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
}
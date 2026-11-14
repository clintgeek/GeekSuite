import { useState, useEffect } from 'react';
import { Box, TextField, Button, Alert, CircularProgress } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthFrame from '../components/AuthFrame';
import { START } from '../components/authLook';
import api from '../api';
import { useBaseGeekAuth } from '../components/AuthContext';
import { safeRedirect } from '../utils/safeRedirect';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useBaseGeekAuth();

  const params = new URLSearchParams(location.search);
  const redirectUrl = params.get('redirect') || '/';
  const app = params.get('app') || 'basegeek';

  // Already signed in — same rationale as LoginPage: bounce back rather than
  // showing a registration form to someone with a live session.
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
        backgroundColor: START.ground,
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
      await api.post('/auth/register', { username: form.username, email: form.email, password: form.password, app });
      window.location.href = safeRedirect(redirectUrl);
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthFrame title="Create a GeekSuite account">
      <form onSubmit={handleSubmit}>
        <TextField label="Username" name="username" value={form.username} onChange={handleChange} fullWidth margin="dense" required autoFocus size="small" />
        <TextField label="Email" name="email" type="email" value={form.email} onChange={handleChange} fullWidth margin="dense" required size="small" />
        <TextField label="Password" name="password" type="password" value={form.password} onChange={handleChange} fullWidth margin="dense" required size="small" />
        {error && <Alert severity="error" sx={{ mt: 1.5, fontSize: '0.8rem' }}>{error}</Alert>}
        <Button type="submit" variant="contained" color="primary" fullWidth disabled={isLoading} sx={{ mt: 2.5, py: 1.25, fontWeight: 600, fontSize: '0.875rem', borderRadius: '10px' }}>
          {isLoading ? 'Working...' : 'Create account'}
        </Button>
        <Button variant="text" fullWidth sx={{ mt: 1, fontSize: '0.8rem', color: 'text.secondary' }} onClick={() => navigate('/login')}>
          Already have an account? Sign in
        </Button>
      </form>
    </AuthFrame>
  );
}

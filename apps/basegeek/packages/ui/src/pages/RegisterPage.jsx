import { useState } from 'react';
import { Box, TextField, Button, Typography, Alert } from '@mui/material';
import { useNavigate, useLocation } from 'react-router-dom';
import useSharedAuthStore from '../store/sharedAuthStore.js';

export default function RegisterPage() {
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const navigate = useNavigate();
  const location = useLocation();
  const { register, error, isLoading } = useSharedAuthStore();

  // Get redirect param from query string
  const params = new URLSearchParams(location.search);
  const redirectUrl = params.get('redirect') || '/';
  const app = params.get('app') || 'basegeek';

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await register(form.username, form.email, form.password, app);
      if (result.success) {
        navigate(redirectUrl);
      }
    } catch (err) {
      console.error('Registration error:', err);
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

      <Box sx={{ width: '100%', maxWidth: 380, mx: 2, position: 'relative', zIndex: 1 }}>
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
          <Typography sx={{ fontWeight: 700, fontSize: '1.5rem', color: '#e4dfd6', letterSpacing: '-0.02em', mb: 0.25 }}>
            baseGeek
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', color: '#52525a', fontFamily: '"Geist Mono", monospace', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            create account
          </Typography>
        </Box>

        <Box sx={{ backgroundColor: '#17171b', borderRadius: '16px', border: '1px solid #252529', p: 3.5 }}>
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
        </Box>

        <Typography sx={{ textAlign: 'center', mt: 3, fontSize: '0.7rem', color: '#3a3a40', fontFamily: '"Geist Mono", monospace' }}>
          GeekSuite — shared authentication
        </Typography>
      </Box>
    </Box>
  );
}
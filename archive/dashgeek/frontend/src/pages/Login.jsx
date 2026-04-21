import React, { useEffect } from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

export default function Login() {
  const theme = useTheme();
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: { xs: 3, md: 6 },
        bgcolor: 'background.default',
      }}
    >
      {/* Center card — hairline-bordered paper on cream page */}
      <Box
        component="section"
        sx={{
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          bgcolor: 'background.paper',
          border: `1px solid ${theme.palette.border}`,
          borderRadius: '10px',
          p: { xs: 5, md: 6 },
        }}
      >
        {/* Wordmark */}
        <Typography
          className="rise"
          sx={{
            fontFamily: theme.typography.fontFamilyMono,
            fontWeight: 700,
            fontSize: { xs: '1.25rem', md: '1.5rem' },
            letterSpacing: '0.12em',
            color: 'text.primary',
            mb: 0.5,
          }}
        >
          DASHGEEK
        </Typography>

        {/* Tagline — mono caption, no italic serif */}
        <Typography
          variant="caption"
          className="rise"
          sx={{
            display: 'block',
            color: 'text.disabled',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            mb: 4,
          }}
        >
          GeekSuite · control surface
        </Typography>

        {/* Lead copy */}
        <Typography
          variant="body2"
          className="rise"
          sx={{
            color: 'text.secondary',
            mb: 4,
            maxWidth: 320,
            mx: 'auto',
            lineHeight: 1.6,
          }}
        >
          One pane for tasks, notes, books, meals, weight, and flock. Sign in
          through baseGeek to continue.
        </Typography>

        {/* Sign-in CTA — primary contained uses ink-slate from theme */}
        <Button
          variant="contained"
          onClick={login}
          disabled={isLoading}
          className="rise"
          sx={{ minWidth: 220 }}
        >
          {isLoading ? 'Opening…' : 'Sign in with baseGeek'}
        </Button>

        {/* Suite attribution */}
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            mt: 5,
            color: 'text.disabled',
          }}
        >
          Part of the GeekSuite
        </Typography>
      </Box>
    </Box>
  );
}

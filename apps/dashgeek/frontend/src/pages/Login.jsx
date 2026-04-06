import React, { useEffect } from 'react';
import { Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { tokens } from '../theme';

export default function Login() {
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
        position: 'relative',
      }}
    >
      {/* Top-left meta ticker */}
      <Box
        sx={{
          position: 'absolute',
          top: { xs: 20, md: 32 },
          left: { xs: 24, md: 48 },
          fontFamily: tokens.fontMono,
          fontSize: '0.55rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: tokens.boneFaint,
          display: 'flex',
          gap: 2,
        }}
      >
        <span style={{ color: tokens.brass }}>◆</span>
        <span>DashGeek · Private Terminal</span>
      </Box>

      {/* Bottom-right colophon */}
      <Box
        sx={{
          position: 'absolute',
          bottom: { xs: 20, md: 32 },
          right: { xs: 24, md: 48 },
          fontFamily: tokens.fontMono,
          fontSize: '0.52rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: tokens.boneFaint,
        }}
      >
        Est. MMXXIV · Hand-set in Fraunces
      </Box>

      {/* Center card */}
      <Box
        sx={{
          maxWidth: 520,
          width: '100%',
          textAlign: 'center',
          borderTop: `1px solid ${tokens.brass}`,
          borderBottom: `1px solid ${tokens.rule}`,
          py: { xs: 6, md: 8 },
          position: 'relative',
        }}
      >
        <Box
          className="rise"
          sx={{
            fontFamily: tokens.fontMono,
            fontSize: '0.58rem',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            color: tokens.brass,
            mb: 3,
          }}
        >
          ── Vol. I ──
        </Box>

        <Box
          className="rise"
          sx={{
            fontFamily: tokens.fontDisplay,
            fontSize: { xs: '3.25rem', md: '5rem' },
            lineHeight: 0.95,
            letterSpacing: '-0.035em',
            fontWeight: 300,
            mb: 2,
            animationDelay: '100ms',
          }}
        >
          Dash
          <Box component="span" sx={{ fontFamily: tokens.fontItalic, fontStyle: 'italic', color: tokens.brass }}>
            geek
          </Box>
        </Box>

        <Box
          className="rise"
          sx={{
            fontFamily: tokens.fontItalic,
            fontStyle: 'italic',
            fontSize: { xs: '1rem', md: '1.15rem' },
            color: tokens.boneDim,
            mb: 5,
            maxWidth: 380,
            mx: 'auto',
            lineHeight: 1.5,
            animationDelay: '200ms',
          }}
        >
          A private terminal for tasks, notes, books, meals, scales, and a small
          flock of birds. Please present credentials.
        </Box>

        <Box
          component="button"
          className="rise"
          onClick={login}
          disabled={isLoading}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            background: 'transparent',
            border: `1px solid ${tokens.brass}`,
            color: tokens.brass,
            fontFamily: tokens.fontMono,
            fontSize: '0.65rem',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            px: 4,
            py: 1.75,
            cursor: isLoading ? 'wait' : 'pointer',
            transition: 'all 300ms var(--ease)',
            animationDelay: '280ms',
            '&:hover': {
              background: tokens.brass,
              color: tokens.ink,
              '& .arrow': { transform: 'translateX(4px)' },
            },
          }}
        >
          {isLoading ? 'Opening the vault…' : 'Enter via baseGeek'}
          <Box component="span" className="arrow" sx={{ transition: 'transform 300ms var(--ease)' }}>
            →
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

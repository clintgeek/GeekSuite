import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  useTheme,
  alpha,
} from '@mui/material';

export function LoginSplash({
  appName,            // "note", "bujo", etc.
  appSuffix = "geek", // usually "geek"
  taglineLine1,       // "Think clearly." or "Journal calmly."
  taglineLine2,       // "Write boldly." (colored)
  description,        // "A focused space for..."
  features = [],      // ["Markdown", "Code Snippets"]
  onLogin,           // async () => void
  loading = false,
  error = '',
  logoColor,         // optional override for the first part of logo
  logoSuffixColor,   // optional override for "geek" part
  inkColors,         // optional override for background ink blobs
  autoRedirect = false, // if true, calls onLogin immediately on mount
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (autoRedirect && onLogin && !loading && !error) {
      onLogin();
    }
  }, [autoRedirect, onLogin, loading, error]);

  // Default colors if not provided, using theme or fallbacks
  const primaryColor = logoColor || theme.palette.primary.main;
  const secondaryColor = logoSuffixColor || theme.palette.primary.main; // or secondary? notegeek used different vars

  // Ink wash colors
  const ink1 = inkColors?.[0] || (isDark
    ? 'rgba(169, 157, 240, 0.07)'
    : 'rgba(91, 80, 168, 0.05)');
  const ink2 = inkColors?.[1] || (isDark
    ? 'rgba(251, 146, 60, 0.05)'
    : 'rgba(232, 89, 12, 0.04)');

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
        color: 'text.primary',
      }}
    >
      {/* Background — editorial ink wash */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          // Diagonal ink wash
          '&::before': {
            content: '""',
            position: 'absolute',
            top: '-30%',
            right: '-20%',
            width: '80vw',
            height: '80vw',
            maxWidth: 900,
            maxHeight: 900,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${ ink1 } 0%, transparent 65%)`,
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            bottom: '-20%',
            left: '-15%',
            width: '60vw',
            height: '60vw',
            maxWidth: 700,
            maxHeight: 700,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${ ink2 } 0%, transparent 65%)`,
          },
        }}
      />

      {/* Left panel — brand statement (desktop only) */}
      {taglineLine1 && (
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            justifyContent: 'center',
            width: '50%',
            px: { md: 6, lg: 10 },
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Box
            sx={{
              maxWidth: 480,
              opacity: 0,
              transform: 'translateX(-20px)',
              animation: mounted ? 'slideInLeft 600ms cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none',
              '@keyframes slideInLeft': {
                to: { opacity: 1, transform: 'translateX(0)' },
              },
            }}
          >
            <Typography
              variant="overline"
              sx={{
                color: 'primary.main',
                mb: 2,
                display: 'block',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
              }}
            >
              Part of GeekSuite
            </Typography>
            <Typography
              variant="h1"
              sx={{
                fontSize: { md: '3rem', lg: '3.75rem' },
                color: 'text.primary',
                mb: 3,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                lineHeight: 1.15,
              }}
            >
              {taglineLine1}{' '}
              <Box component="span" sx={{ color: 'primary.main' }}>
                {taglineLine2}
              </Box>
            </Typography>
            <Typography
              variant="body1"
              sx={{
                color: 'text.secondary',
                fontSize: '1.1rem',
                maxWidth: 380,
                lineHeight: 1.8,
              }}
            >
              {description}
            </Typography>

            {/* Feature pills */}
            {features.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 4 }}>
                {features.map((feat, i) => (
                  <Box
                    key={feat}
                    sx={{
                      px: 2,
                      py: 0.75,
                      borderRadius: 2,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'text.secondary',
                      border: `1px solid ${ theme.palette.divider }`,
                      bgcolor: alpha(theme.palette.background.paper, 0.5),
                      opacity: 0,
                      animation: mounted ? `fadeIn 400ms ease-out ${ 300 + i * 60 }ms forwards` : 'none',
                      '@keyframes fadeIn': {
                        to: { opacity: 1 },
                      },
                    }}
                  >
                    {feat}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Right panel — login card */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          width: { xs: '100%', md: '50%' },
          px: { xs: 3, sm: 4 },
          position: 'relative',
          zIndex: 1,
          // Center on mobile if no left panel
          mx: { xs: 'auto', md: 0 },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: { xs: 4, sm: 5 },
            width: '100%',
            maxWidth: 400,
            borderRadius: 4,
            backgroundColor: alpha(theme.palette.background.paper, isDark ? 0.7 : 0.85),
            backdropFilter: 'blur(24px)',
            border: `1px solid ${ alpha(theme.palette.divider, 0.6) }`,
            opacity: 0,
            transform: 'translateY(16px)',
            animation: mounted ? 'slideUp 500ms cubic-bezier(0.16, 1, 0.3, 1) 100ms forwards' : 'none',
            '@keyframes slideUp': {
              to: { opacity: 1, transform: 'translateY(0)' },
            },
          }}
        >
          {/* Brand */}
          <Box sx={{ mb: 4 }}>
            <Typography
              variant="h3"
              component="div"
              sx={{
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                fontWeight: 800,
                fontSize: { xs: '2rem', sm: '2.5rem' },
                display: 'flex',
                alignItems: 'baseline',
                letterSpacing: '-0.03em',
                mb: 1,
              }}
            >
              <Box component="span" sx={{ color: logoColor || 'text.primary' }}>{appName}</Box>
              <Box component="span" sx={{ color: logoSuffixColor || 'primary.main' }}>{appSuffix}</Box>
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                lineHeight: 1.6,
              }}
            >
              Sign in to your workspace
            </Typography>
          </Box>

          {/* Error alert */}
          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 3,
                borderRadius: 2,
                animation: 'shake 350ms ease-out',
                '@keyframes shake': {
                  '0%, 100%': { transform: 'translateX(0)' },
                  '25%': { transform: 'translateX(-6px)' },
                  '75%': { transform: 'translateX(6px)' },
                },
              }}
            >
              {error}
            </Alert>
          )}

          {/* SSO button */}
          <Button
            variant="contained"
            color="primary"
            fullWidth
            size="large"
            onClick={onLogin}
            disabled={loading}
            sx={{
              py: 1.75,
              fontSize: '0.95rem',
              borderRadius: 2.5,
              position: 'relative',
              overflow: 'hidden',
              '&::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%)',
                pointerEvents: 'none',
              },
            }}
          >
            {loading ? (
              <CircularProgress size={22} color="inherit" />
            ) : (
              'Continue with GeekSuite'
            )}
          </Button>

          {/* Divider */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              my: 3,
              gap: 2,
            }}
          >
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
            <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Secured by GeekBase
            </Typography>
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
          </Box>

          {/* Capabilities — mobile only (replacing emojis) */}
          {features.length > 0 && (
            <Box
              sx={{
                display: { xs: 'flex', md: 'none' },
                flexWrap: 'wrap',
                gap: 0.75,
                justifyContent: 'center',
              }}
            >
              {features.slice(0, 4).map((feat) => (
                <Box
                  key={feat}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    borderRadius: 1.5,
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                    bgcolor: alpha(theme.palette.text.primary, 0.04),
                  }}
                >
                  {feat}
                </Box>
              ))}
            </Box>
          )}
        </Paper>

        {/* Version tag */}
        <Typography
          variant="caption"
          sx={{
            mt: 3,
            color: 'text.disabled',
            fontSize: '0.65rem',
            letterSpacing: '0.05em',
            opacity: 0,
            animation: mounted ? 'fadeIn 400ms ease-out 600ms forwards' : 'none',
          }}
        >
          {appName.charAt(0).toUpperCase() + appName.slice(1)}{appSuffix} v1.0 &middot; GeekSuite
        </Typography>
      </Box>
    </Box>
  );
}

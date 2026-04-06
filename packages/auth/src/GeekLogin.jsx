import { Box, Button, CircularProgress, Divider, Paper, Typography } from '@mui/material';
import { useAuth } from './AuthProvider.jsx';

/**
 * A shared, themeable login screen for any GeekSuite app.
 *
 * Props:
 *   appName     – display name, e.g. "NoteGeek"
 *   tagline     – short subtitle shown below the name
 *   accentColor – optional CSS colour for the brand badge (defaults to primary.main)
 *   badgeLetter – single character shown inside the brand badge (defaults to first letter of appName)
 *   returnTo    – optional URL to redirect back to after login (defaults to current origin)
 */
export default function GeekLogin({
  appName = 'GeekSuite',
  tagline = '',
  accentColor,
  badgeLetter,
  returnTo,
}) {
  const { login, register, loading } = useAuth();

  const letter = badgeLetter || appName.charAt(0).toUpperCase();

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 400,
          p: 5,
          textAlign: 'center',
          borderRadius: 3,
        }}
      >
        {/* Brand badge */}
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 1.5,
            bgcolor: accentColor || 'primary.main',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '1.5rem',
            mb: 2,
          }}
        >
          {letter}
        </Box>

        <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
          {appName}
        </Typography>

        {tagline && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {tagline}
          </Typography>
        )}

        <Divider sx={{ mb: 3 }} />

        {loading ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              py: 3,
            }}
          >
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Checking session…
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={() => login(returnTo)}
            >
              Sign in with GeekSuite
            </Button>
            <Button
              variant="text"
              size="small"
              onClick={() => register(returnTo)}
            >
              Don't have an account? Sign up
            </Button>
          </Box>
        )}

        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ mt: 3, display: 'block' }}
        >
          Protected by BaseGeek Secure Authentication
        </Typography>
      </Paper>
    </Box>
  );
}

/**
 * AuthFrame — the sign-in path's share of the Signal Box.
 *
 * LoginPage and RegisterPage are the suite's SSO door: every app's
 * `loginRedirect()` sends people here, Heather included. So they get the
 * identity at its calmest — the steel panel, the signal-head mark showing
 * clear, the stencil wordmark, a brass rule over the card — and none of the
 * theatre: no flaps, no gauges, nothing that moves, nothing to learn. The
 * form is a form.
 */
import { Box, Typography } from '@mui/material';
import SignalHead from './SignalHead';

export default function AuthFrame({ subtitle, children, footer = 'GeekSuite — one sign-in for every app' }) {
  return (
    <Box
      component="main"
      sx={(theme) => ({
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        '@supports (height: 100dvh)': { minHeight: '100dvh' },
        py: 4,
        bgcolor: theme.palette.surfaces.base,
      })}
    >
      <Box sx={{ width: '100%', maxWidth: 400, mx: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 3 }}>
          <SignalHead size={44} />
          <Box>
            <Typography
              component="h1"
              sx={{ fontFamily: 'fontFamilyPlate', fontWeight: 800, fontSize: '2rem', lineHeight: 1, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.primary' }}
            >
              baseGeek
            </Typography>
            <Typography sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.5 }}>
              {subtitle}
            </Typography>
          </Box>
        </Box>

        <Box
          sx={(theme) => ({
            bgcolor: 'background.paper',
            borderRadius: 1.5,
            border: `1px solid ${theme.palette.line.panel}`,
            borderTop: `4px solid ${theme.palette.primary.main}`,
            boxShadow: theme.shadows[3],
            p: { xs: 2.5, sm: 3.5 },
          })}
        >
          {children}
        </Box>

        <Typography sx={{ textAlign: 'center', mt: 3, fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'fontFamilyMono' }}>
          {footer}
        </Typography>
      </Box>
    </Box>
  );
}

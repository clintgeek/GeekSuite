/**
 * PenPage — the measure every view sits in: one column, 720px at most, the
 * suite's 16px phone gutter. `dock` reserves room at the bottom on phones for
 * the pinned add box.
 */
import { Box } from '@mui/material';

export default function PenPage({ children, dock = false }) {
  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: 'auto',
        px: { xs: 4, sm: 6 },
        pb: { xs: dock ? 30 : 8, md: 12 },
      }}
    >
      {children}
    </Box>
  );
}

/**
 * Loading is a still line of grey, not a shimmer: the strike is the app's only
 * animation.
 */
export function PenLoading() {
  return (
    <Box role="status" sx={{ py: 6, pl: 5, color: 'text.secondary', fontSize: '1rem' }}>
      Opening the list…
    </Box>
  );
}

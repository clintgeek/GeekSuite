/**
 * PenPage — the measure every view sits in: one column, 720px at most, the
 * suite's 16px phone gutter. `dock` reserves room at the bottom on phones for
 * the pinned add box.
 */
import { Box, Button } from '@mui/material';

export default function PenPage({ children, dock = false }) {
  return (
    <Box
      sx={{
        maxWidth: 720,
        mx: 'auto',
        px: { xs: 4, sm: 6 },
        pb: { xs: dock ? 38 : 8, md: 12 },
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

/**
 * A failed load is said, never drawn as an empty list (plan 1.12): "Nothing due
 * today" after an expired session or a dropped connection is a lie that looks
 * like good news. `onRetry` re-reads the list.
 */
export function PenLoadError({ onRetry }) {
  return (
    <Box role="alert" data-load-error sx={{ py: 6, pl: 5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3, color: 'text.primary', fontSize: '1rem' }}>
      <span>Couldn’t reach your list.</span>
      <Button onClick={onRetry} variant="outlined" sx={{ minHeight: 44, px: 4 }}>Retry</Button>
    </Box>
  );
}

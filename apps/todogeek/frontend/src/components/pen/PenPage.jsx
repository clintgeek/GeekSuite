/**
 * PenPage — the measure every view sits in: one column (`GeekContentColumn`,
 * capped and centred in the space beside the rail or sidebar), the suite's
 * 16px phone gutter. 720px at most on a desktop; 640px on a tablet, so a row
 * at 800px portrait is ~590px of words, not 780 (tablet wave 3). `dock`
 * reserves room at the bottom for the pinned add box (phone, portrait tablet).
 */
import { Box, Button } from '@mui/material';
import { GeekContentColumn, GeekLoadError } from '@geeksuite/ui';
import useTodoLayout from '../../hooks/useTodoLayout';

export const PEN_COLUMN = 720;
export const PEN_COLUMN_TABLET = 640;

export function usePenColumnWidth() {
  return useTodoLayout().tablet ? PEN_COLUMN_TABLET : PEN_COLUMN;
}

export default function PenPage({ children, dock = false }) {
  const maxWidth = usePenColumnWidth();
  return (
    <GeekContentColumn
      maxWidth={maxWidth}
      data-pen-page
      sx={{
        // The phone has no cap from the column; 720 kept it centred on a wide phone-width window.
        maxWidth,
        mx: 'auto',
        px: { xs: 4, sm: 6 },
        pb: dock ? 38 : { xs: 8, md: 12 },
      }}
    >
      {children}
    </GeekContentColumn>
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
  const { phone } = useTodoLayout();
  if (!phone) {
    // Wider than a phone: a centred state with room around it, not a small
    // line top-left in an empty page (tablet baseline, 61-load-error).
    return (
      <GeekLoadError
        data-load-error
        title="Couldn’t reach your list."
        onRetry={onRetry}
        retrySx={{ px: 4 }}
        sx={{ minHeight: '40vh', justifyContent: 'center' }}
      />
    );
  }
  return (
    <Box role="alert" data-load-error sx={{ py: 6, pl: 5, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 3, color: 'text.primary', fontSize: '1rem' }}>
      <span>Couldn’t reach your list.</span>
      <Button onClick={onRetry} variant="outlined" sx={{ minHeight: 44, px: 4 }}>Retry</Button>
    </Box>
  );
}

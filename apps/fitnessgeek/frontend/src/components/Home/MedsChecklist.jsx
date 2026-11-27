import React from 'react';
import { Box, Button, ButtonBase, Typography, Alert } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Check as CheckIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';

/**
 * "Did you take your meds?" — the meds check-in on Today, for anyone with
 * medications (ONE_APP_PLAN.md §1.6). One big tick per dose, named plainly:
 * "Metformin · Morning". Tapping writes a dose log; tapping again takes it
 * back. Each row is a real checkbox to a screen reader.
 *
 * `unknown`: the day's dose logs could not be read. No count and no boxes —
 * empty boxes would read as "nothing taken" and invite a second dose
 * (SUITE_REVIEW_2026-11 FitnessGeek #3) — just the problem and a retry.
 * `ticksError` with known ticks: a refresh failed; the ticks shown are the
 * last ones read, and the note says so.
 */
export default function MedsChecklist({ items = [], taken = 0, total = 0, onToggle, saving, error, unknown = false, ticksError = null, onRetry, title = 'Did you take your meds?' }) {
  const theme = useTheme();
  // Taken is the app's "done" look: a filled blue tick box beside the
  // name. The row itself stays plain paper with a hairline under it, like
  // a row on a label; no tinted boxes in the panel.
  const blue = theme.palette.primary.main;

  return (
    <Box component="section" aria-labelledby="meds-checklist-title" data-testid="meds-checklist">
      {/* The card title, like every other card; the count at the right. */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 3, mb: 2 }}>
        <Typography id="meds-checklist-title" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {title}
        </Typography>
        {total > 0 && !unknown && (
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, whiteSpace: 'nowrap', color: taken === total ? 'success.main' : 'text.secondary' }}>
            {taken === total ? `All ${total} taken` : `${taken} of ${total}`}
          </Typography>
        )}
      </Box>

      {unknown && total > 0 ? (
        <Alert
          severity="warning"
          data-testid="meds-ticks-unknown"
          action={onRetry ? <Button color="inherit" onClick={onRetry} sx={{ minHeight: 44, fontWeight: 700 }}>Try again</Button> : null}
        >
          Couldn’t check which doses are ticked, so this can’t say what’s been taken. Try again before taking one.
        </Alert>
      ) : total === 0 ? (
        <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem' }}>
          No meds added yet.{' '}
          <Box component={RouterLink} to="/medications" sx={{ color: 'primary.main', fontWeight: 700 }}>
            Add one
          </Box>
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {items.map((item, i) => (
            <ButtonBase
              key={item.key}
              role="checkbox"
              aria-checked={item.taken}
              aria-busy={saving === item.key}
              aria-label={`${item.name}${item.slotLabel ? `, ${item.slotLabel.toLowerCase()}` : ''}${item.taken ? ', taken' : ''}`}
              onClick={() => onToggle?.(item)}
              data-testid={`med-${item.key}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 3.5,
                minHeight: 64,
                py: 2,
                textAlign: 'left',
                borderTop: i === 0 ? 0 : `1px solid ${theme.palette.divider}`,
                '@media (hover: hover)': { '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.03) } },
                '&:focus-visible': { outline: `3px solid ${blue}`, outlineOffset: 2 },
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: item.taken ? blue : 'transparent',
                  color: theme.palette.primary.contrastText,
                  border: item.taken ? `2px solid ${blue}` : `2px solid ${theme.palette.text.secondary}`,
                }}
              >
                {item.taken && <CheckIcon sx={{ fontSize: 22 }} />}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '1.0625rem', fontWeight: 600, color: item.taken ? 'text.secondary' : 'text.primary', lineHeight: 1.25 }}>
                  {item.name}
                </Typography>
                {item.slotLabel && (
                  <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>{item.slotLabel}</Typography>
                )}
              </Box>
            </ButtonBase>
          ))}
        </Box>
      )}
      {!unknown && ticksError && total > 0 && (
        <Alert
          severity="warning"
          sx={{ mt: 1.5 }}
          action={onRetry ? <Button color="inherit" onClick={onRetry} sx={{ minHeight: 44, fontWeight: 700 }}>Try again</Button> : null}
        >
          Couldn’t refresh your ticks. These are the last ones loaded.
        </Alert>
      )}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    </Box>
  );
}

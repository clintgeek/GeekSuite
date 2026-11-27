import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { tonalColors } from '../../theme/theme.jsx';

/**
 * "Weighed ✓ · BP — · Meds 2 of 3" (today's check-ins, ONE_APP_PLAN.md §1.4), drawn
 * as a row of rounded pills.
 *
 * Each check-in is a link to the place you do it, so the strip is navigation
 * as much as a status line. Done is a pale green pill with a ✓ (the words stay in the normal ink); not yet is
 * a tinted blue pill (something to press), never red — missing a weigh-in is not an
 * error. The items come from `todayStrip()` (utils/checkIns.js).
 */
export default function TodayStrip({ items = [], onMedsClick, sx }) {
  const theme = useTheme();
  const tonal = tonalColors(theme);
  if (items.length === 0) return null;

  return (
    <Box
      component="nav"
      aria-label="Today’s check-ins"
      data-testid="today-strip"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, ...sx }}
    >
      {items.map((item) => {
        const linkProps = item.id === 'meds' && onMedsClick
          ? { onClick: onMedsClick }
          : { component: RouterLink, to: item.to };
        return (
          <ButtonBase
            key={item.id}
            {...linkProps}
            aria-label={item.spoken}
            data-testid={`today-strip-${item.id}`}
            data-done={item.done ? 'true' : 'false'}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              minHeight: 44,
              px: 3.5,
              borderRadius: 999,
              bgcolor: item.done ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.13) : tonal.bg,
              color: item.done ? 'text.primary' : tonal.ink,
              '@media (hover: hover)': { '&:hover': { bgcolor: item.done ? alpha(theme.palette.success.main, 0.22) : tonal.hover } },
              '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
            }}
          >
            <Typography component="span" sx={{ fontSize: '0.9375rem', fontWeight: 600 }}>
              {item.label}
            </Typography>
            <Box
              component="span"
              aria-hidden
              sx={{
                fontWeight: 600,
                fontSize: '0.9375rem',
                whiteSpace: 'nowrap',
                color: 'inherit',
              }}
            >
              {item.value}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

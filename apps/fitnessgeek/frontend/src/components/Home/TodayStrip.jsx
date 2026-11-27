import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';

/**
 * "Weighed ✓ · BP — · Meds 2 of 3" (SIMPLE_AND_FULL_PLAN.md item 6), drawn
 * as the foot of the Today's Facts label: small square ink-bordered links.
 *
 * Each check-in is a link to the place you do it, so the strip is navigation
 * as much as a status line. Done reads as an ink ✓; not yet reads in the
 * app's blue (something to press), never red — missing a weigh-in is not an
 * error. The items come from `todayStrip()` (utils/checkIns.js).
 */
export default function TodayStrip({ items = [], onMedsClick, sx }) {
  const theme = useTheme();
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
              px: 1.25,
              border: `1.5px solid ${theme.palette.text.primary}`,
              color: 'text.primary',
              '@media (hover: hover)': { '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.05) } },
              '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
            }}
          >
            <Typography component="span" sx={{ fontSize: '0.9375rem', fontWeight: 700 }}>
              {item.label}
            </Typography>
            <Box
              component="span"
              aria-hidden
              sx={{
                fontWeight: 700,
                fontSize: '0.9375rem',
                whiteSpace: 'nowrap',
                color: item.done ? 'text.primary' : 'primary.main',
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

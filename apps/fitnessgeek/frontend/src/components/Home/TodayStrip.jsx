import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';

/**
 * "Weighed ✓ · BP — · Meds 2 of 3" (SIMPLE_AND_FULL_PLAN.md item 6).
 *
 * Each check-in is a link to the place you do it, so the strip is navigation
 * as much as a status line. Done reads as a basil-filled ✓ (basil means
 * done; leaf means Lunch — visual review B2);
 * not yet is an em dash, never red — missing a weigh-in is not an error.
 * The items come from `todayStrip()` (utils/checkIns.js).
 */
export default function TodayStrip({ items = [], onMedsClick }) {
  const theme = useTheme();
  if (items.length === 0) return null;

  return (
    <Box
      component="nav"
      aria-label="Today’s check-ins"
      data-testid="today-strip"
      sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}
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
              gap: 1,
              minHeight: 48,
              pl: 2,
              pr: 1,
              borderRadius: 999,
              bgcolor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              color: 'text.primary',
              '@media (hover: hover)': { '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) } },
              '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
            }}
          >
            <Typography component="span" sx={{ fontSize: '1.0625rem', fontWeight: 700 }}>
              {item.label}
            </Typography>
            <Box
              component="span"
              aria-hidden
              sx={{
                minWidth: 32,
                height: 32,
                px: item.value.length > 2 ? 1.25 : 0,
                borderRadius: 999,
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
                fontSize: '1rem',
                bgcolor: item.done ? theme.palette.primary.main : alpha(theme.palette.text.primary, 0.06),
                color: item.done ? theme.palette.primary.contrastText : 'text.secondary',
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

import React from 'react';
import { Box, ButtonBase, Container, Typography } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { ChevronRight as ChevronIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { moreGroupsFor } from '../components/Layout/navConfig.jsx';
import { useExperience } from '../contexts/ExperienceContext.jsx';

/**
 * More — everything that isn't Home, Log or Weight
 * (DOCS/SIMPLE_AND_FULL_PLAN.md item 6). Activity, Reports and Profile used
 * to hold bottom-bar slots; they live here now, with every other page, so
 * moving the check-ins into the bar removed nothing.
 *
 * Big rows, one line of plain description each. Simple mode puts blood
 * pressure, meds and Settings first and the rest under "Everything else".
 */
export default function More() {
  const theme = useTheme();
  const { effectiveMode } = useExperience();
  const groups = moreGroupsFor(effectiveMode);

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 2, sm: 3 }, px: { xs: 2, sm: 3 }, pb: { xs: 4, md: 6 } }} data-testid="more-page">
      {groups.map((group) => (
        <Box component="section" key={group.label} aria-labelledby={`more-${group.label}`} sx={{ mb: 3 }}>
          <Typography id={`more-${group.label}`} component="h2" sx={{ fontSize: '1.125rem', fontWeight: 800, color: 'text.secondary', mb: 1 }}>
            {group.label}
          </Typography>
          <Box
            component="ul"
            sx={{
              listStyle: 'none', m: 0, p: 0,
              borderRadius: '24px',
              overflow: 'hidden',
              bgcolor: 'background.paper',
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            {group.items.map((item, i) => {
              const Icon = item.Icon;
              return (
                <Box component="li" key={item.id} sx={{ borderTop: i ? `1px solid ${theme.palette.divider}` : 'none' }}>
                  <ButtonBase
                    component={RouterLink}
                    to={item.to}
                    sx={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      gap: 2,
                      px: 2,
                      py: 1.5,
                      minHeight: 72,
                      color: 'text.primary',
                      '@media (hover: hover)': { '&:hover': { bgcolor: alpha(theme.palette.text.primary, 0.04) } },
                      '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: -3 },
                    }}
                  >
                    <Box
                      aria-hidden
                      sx={{
                        width: 44, height: 44, borderRadius: '14px', flexShrink: 0, display: 'grid', placeItems: 'center',
                        bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.1),
                        color: 'primary.main',
                      }}
                    >
                      <Icon />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '1.125rem', fontWeight: 800, lineHeight: 1.25 }}>{item.label}</Typography>
                      {item.description && (
                        <Typography sx={{ fontSize: '1rem', color: 'text.secondary', lineHeight: 1.35 }}>{item.description}</Typography>
                      )}
                    </Box>
                    <ChevronIcon aria-hidden sx={{ color: 'text.secondary' }} />
                  </ButtonBase>
                </Box>
              );
            })}
          </Box>
        </Box>
      ))}
    </Container>
  );
}

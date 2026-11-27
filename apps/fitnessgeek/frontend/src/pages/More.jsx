import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronRight as ChevronIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { moreGroupsFor } from '../components/Layout/navConfig.jsx';
import { useExperience } from '../contexts/ExperienceContext.jsx';
import { LabelPanel, Page } from '../components/primitives';

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
  const { effectiveMode } = useExperience();
  const groups = moreGroupsFor(effectiveMode);

  return (
    <Page narrow data-testid="more-page">
      {groups.map((group) => (
        <LabelPanel
          key={group.label}
          title={group.label}
          titleComponent="h2"
          component="section"
          aria-label={group.label}
        >
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {group.items.map((item, i) => {
              const Icon = item.Icon;
              const { label, description } = item;
              return (
                <Box component="li" key={item.id} sx={{ borderTop: i ? (t) => `1px solid ${t.palette.divider}` : 'none' }}>
                  {/* The anchor itself is the 56px+ full-width target: the
                      harness measures the link element. */}
                  <ButtonBase
                    component={RouterLink}
                    to={item.to}
                    sx={{
                      display: 'flex',
                      width: '100%',
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      gap: 2,
                      py: 1.25,
                      minHeight: 56,
                      color: 'text.primary',
                      '@media (hover: hover)': { '&:hover': { bgcolor: (t) => alpha(t.palette.text.primary, 0.04) } },
                      '&:focus-visible': { outline: (t) => `3px solid ${t.palette.primary.main}`, outlineOffset: -3 },
                    }}
                  >
                    <Icon aria-hidden sx={{ color: 'text.primary', flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.25 }}>{label}</Typography>
                      {description && (
                        <Typography sx={{ fontSize: '1rem', fontWeight: 400, color: 'text.secondary', lineHeight: 1.35 }}>{description}</Typography>
                      )}
                    </Box>
                    <ChevronIcon aria-hidden sx={{ color: 'text.primary' }} />
                  </ButtonBase>
                </Box>
              );
            })}
          </Box>
        </LabelPanel>
      ))}
    </Page>
  );
}

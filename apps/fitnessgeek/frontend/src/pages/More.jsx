import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronRight as ChevronIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { moreGroupsFor } from '../components/Layout/navConfig.jsx';
import { LabelPanel, Page } from '../components/primitives';

/**
 * More — everything the phone's tabs (Today, Weight, Trends) don't hold
 * (DOCS/ONE_APP_PLAN.md §3): Blood pressure, Medications, Saved foods,
 * Calorie plan, Import a scan, Settings. One list, the same for everybody.
 *
 * Big rows, one line of plain description each.
 */

export default function More() {
  const groups = moreGroupsFor();

  return (
    <Page narrow data-testid="more-page">
      {groups.map((group) => (
        <LabelPanel
          key={group.label}
          // The top bar already says "More"; one list needs no second title.
          title={groups.length > 1 ? group.label : undefined}
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

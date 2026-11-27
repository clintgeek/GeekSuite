import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { ChevronRight as ChevronIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { GeekAppSwitcher } from '@geeksuite/ui';
import { APP_NAME, moreGroupsFor } from '../components/Layout/navConfig.jsx';
import { LabelPanel, Page } from '../components/primitives';

/**
 * More — everything the phone's tabs (Today, Weight, Trends) don't hold
 * (DOCS/ONE_APP_PLAN.md §3): Blood pressure, Medications, Saved foods,
 * Calorie plan, Import a scan, Settings. One list, the same for everybody.
 *
 * Rows made to be scanned: icon, name, ONE short line. A description that
 * wrapped to a second line made its row taller than its neighbours, so the
 * two that did at 390px are said shorter here, and no line may wrap.
 */

// Shorter words for this list only (the sidebar and titles keep navConfig's).
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
              const { label } = item;
              const description = item.description;
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
                      gap: 4,
                      py: 2.5,
                      minHeight: 64,
                      color: 'text.primary',
                      borderRadius: '8px',
                      '@media (hover: hover)': { '&:hover': { bgcolor: (t) => alpha(t.palette.text.primary, 0.04) } },
                      '&:focus-visible': { outline: (t) => `3px solid ${t.palette.primary.main}`, outlineOffset: -3 },
                    }}
                  >
                    {/* The icon in a soft round of the app's blue: the thing
                        the eye finds first going down the list. */}
                    <Box
                      aria-hidden
                      sx={{
                        width: 40, height: 40, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
                        bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.2 : 0.1),
                        color: 'primary.main',
                      }}
                    >
                      <Icon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: '1.0625rem', fontWeight: 600, lineHeight: 1.3 }}>{label}</Typography>
                      {description && (
                        <Typography noWrap sx={{ fontSize: '0.9375rem', fontWeight: 400, color: 'text.secondary', lineHeight: 1.4 }}>{description}</Typography>
                      )}
                    </Box>
                    <ChevronIcon aria-hidden sx={{ color: 'text.secondary', flexShrink: 0 }} />
                  </ButtonBase>
                </Box>
              );
            })}
          </Box>
        </LabelPanel>
      ))}
      {/* The other Geek apps. On a phone the header no longer carries the
          nine-dot grid, so it lives here, with words beside it. */}
      <Box
        data-testid="more-other-apps"
        sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', justifyContent: 'space-between', gap: 3, px: 4, minHeight: 56 }}
      >
        <Typography sx={{ fontSize: '0.9375rem', color: 'text.secondary' }}>Your other Geek apps</Typography>
        <GeekAppSwitcher currentApp={APP_NAME} />
      </Box>
    </Page>
  );
}

/**
 * The members-only page. ThingGeek holds firearms and their serials, so only
 * the household's members may open it (DOCS/THINGGEEK_PLAN.md). Anyone else
 * who signs in lands here: calm, clear about why, with a way out — never a
 * crash and never a login loop (they ARE signed in; the login page would
 * only bring them back).
 *
 * Moving Day: the sign on the yard's gate — black and orange, striped, a
 * stencilled "MEMBERS ONLY" (decoration; the heading says it in words).
 */
import React from 'react';
import { Box, Button, Link, Typography } from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import { CHROME, DISPLAY_FONT, LIVERY, STENCIL_FONT, dustImage, speedStripes } from '../theme/theme';
import { displayNameFrom, secondaryFrom } from '../utils/userDisplay';
import BoxMark from './BoxMark';

export default function NotAMember({ user, onSignOut }) {
  const who = user ? secondaryFrom(user) || displayNameFrom(user) : null;
  return (
    <Box
      component="main"
      data-testid="not-a-member"
      sx={{
        minHeight: '100vh',
        '@supports (height: 100dvh)': { minHeight: '100dvh' },
        display: 'grid',
        placeItems: 'center',
        px: 2,
        py: 4,
        bgcolor: 'background.default',
        backgroundImage: (t) => dustImage(t.palette.mode),
      }}
    >
      <Box
        sx={{
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          borderRadius: '4px',
          overflow: 'hidden',
          border: 1,
          borderColor: 'border',
          bgcolor: 'background.paper',
          boxShadow: '0 3px 0 rgba(0,0,0,0.25)',
        }}
      >
        {/* The gate sign's header: black, striped, stencilled. */}
        <Box aria-hidden="true" sx={{ position: 'relative', height: 64, bgcolor: CHROME.bar, backgroundImage: speedStripes(), display: 'grid', placeItems: 'center' }}>
          <Box
            component="span"
            data-caption="MEMBERS ONLY"
            sx={{ px: 1.5, py: 0.5, bgcolor: CHROME.bar, color: LIVERY.orange, fontFamily: STENCIL_FONT, fontSize: '1rem', letterSpacing: '0.16em', '&::before': { content: 'attr(data-caption)' } }}
          />
        </Box>
        <Box sx={{ px: { xs: 3, sm: 4 }, pt: 3, pb: { xs: 4, sm: 5 } }}>
          <BoxMark size={48} sx={{ mx: 'auto', mb: 2 }} />
          <Typography component="h1" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '1.5rem', lineHeight: 1.2, mb: 1.25 }}>
            ThingGeek is only open to members of this household
          </Typography>
          <Typography sx={{ color: 'text.secondary', lineHeight: 1.6, mb: 1 }}>
            It keeps the household's inventory — serial numbers, receipts and values — so it stays with the people who live here.
          </Typography>
          {who ? (
            <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 3 }}>
              You're signed in as{' '}
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
                {who}
              </Box>
              .
            </Typography>
          ) : (
            <Box sx={{ mb: 3 }} />
          )}
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="contained" startIcon={<LogoutIcon />} onClick={onSignOut}>
              Sign out
            </Button>
            <Button component={Link} href="https://start.clintgeek.com" variant="outlined" sx={{ color: 'text.primary' }}>
              Back to GeekSuite
            </Button>
          </Box>
          <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 3, lineHeight: 1.6 }}>Think you should have access? Ask the household to add your account.</Typography>
        </Box>
      </Box>
    </Box>
  );
}

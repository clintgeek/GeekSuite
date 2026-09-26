/**
 * The members-only page. ThingGeek holds firearms and their serials, so only
 * the household's members may open it (DOCS/THINGGEEK_PLAN.md). Anyone else
 * who signs in lands here: calm, clear about why, with a way out — never a
 * crash and never a login loop (they ARE signed in; the login page would
 * only bring them back).
 */
import React from 'react';
import { Box, Button, Link, Typography } from '@mui/material';
import { Logout as LogoutIcon } from '@mui/icons-material';
import { DISPLAY_FONT } from '../theme/theme';
import { displayNameFrom, secondaryFrom } from '../utils/userDisplay';
import TagMark from './TagMark';

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
      }}
    >
      <Box
        sx={{
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          px: { xs: 3, sm: 4 },
          py: { xs: 4, sm: 5 },
          borderRadius: 3,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <TagMark size={56} sx={{ mx: 'auto', mb: 2.5 }} />
        <Typography component="h1" sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: '1.5rem', lineHeight: 1.2, letterSpacing: '-0.015em', mb: 1.25 }}>
          ThingGeek is only open to members of this household
        </Typography>
        <Typography sx={{ color: 'text.secondary', lineHeight: 1.6, mb: 1 }}>
          It keeps the household's inventory — serial numbers, receipts and values — so it stays with the people who live here.
        </Typography>
        {who ? (
          <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem', mb: 3 }}>
            You're signed in as <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{who}</Box>.
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
        <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 3, lineHeight: 1.6 }}>
          Think you should have access? Ask the household to add your account.
        </Typography>
      </Box>
    </Box>
  );
}

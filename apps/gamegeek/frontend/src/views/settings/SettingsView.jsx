/** `/settings` — one page, bookgeek-style: a column of cards. */
import React, { useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { useGameProfile, useVocabulary } from '../../hooks/useGameMeta';
import { visuallyHidden } from '../../utils/a11y';
import { AccountCard, AppearanceCard } from './AppearanceAccountCards';
import MetadataCard from './MetadataCard';
import PlatformsCard from './PlatformsCard';
import PlayniteImportCard from './PlayniteImportCard';
import ShelvesCard from './ShelvesCard';
import StorefrontsCard from './StorefrontsCard';

export default function SettingsView({ user, onSignOut }) {
  const { profile } = useGameProfile();
  const vocab = useVocabulary();
  const location = useLocation();

  // /settings#playnite (from the empty library, the Add dialog) lands on the
  // Playnite card.
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView?.({ block: 'start' });
  }, [location.hash, profile]);

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 }, maxWidth: 820, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2, pb: 8 }}>
      <Box sx={{ mb: 0.5 }}>
        <Typography component="h1" sx={visuallyHidden}>
          Settings
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
          Your platforms, shelves and imports. The library itself is shared with the household.
        </Typography>
      </Box>
      <PlayniteImportCard profile={profile} />
      <MetadataCard />
      <PlatformsCard profile={profile} vocab={vocab} />
      <ShelvesCard profile={profile} />
      <StorefrontsCard />
      <AppearanceCard />
      <AccountCard user={user} onSignOut={onSignOut} />
    </Box>
  );
}

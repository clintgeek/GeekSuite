/**
 * The top of the detail sheet: a soft backdrop washed from the game's own art
 * (or its plate colours), the cover, and the facts that identify it — title,
 * year, who made it, and the platforms we own it on.
 *
 * Text never sits on the backdrop: it fades to the paper before the title
 * starts, so every line is measured against a solid surface.
 */
import React from 'react';
import { Box, Typography } from '@mui/material';
import { Favorite as FavoriteIcon } from '@mui/icons-material';
import GameCover from '../../components/GameCover';
import PlatformChips, { copyPlatforms } from '../../components/PlatformChips';
import { DISPLAY_FONT } from '../../theme/theme';
import { yearOf } from '../../utils/dates';
import { plateFor } from '../../utils/titlePlate';

function Backdrop({ game }) {
  const { from, to } = plateFor(game?.title);
  return (
    <Box aria-hidden="true" sx={{ position: 'absolute', inset: 0, height: { xs: 190, md: 220 }, overflow: 'hidden', zIndex: 0 }}>
      {game?.coverUrl ? (
        <Box
          component="img"
          src={game.coverUrl}
          alt=""
          sx={{ position: 'absolute', inset: '-20%', width: '140%', height: '140%', objectFit: 'cover', filter: 'blur(28px) saturate(1.1)', opacity: 0.55 }}
        />
      ) : (
        <Box sx={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, ${from}, ${to})`, opacity: (t) => (t.palette.mode === 'dark' ? 0.9 : 0.55) }} />
      )}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: (t) => `linear-gradient(180deg, transparent 0%, transparent 35%, ${t.palette.background.paper} 100%)`,
        }}
      />
    </Box>
  );
}

export default function DetailHero({ game }) {
  const year = yearOf(game);
  const devs = game.developers ?? [];
  const pubs = (game.publishers ?? []).filter((p) => !devs.includes(p));
  const platforms = copyPlatforms(game);

  return (
    <Box sx={{ position: 'relative', pt: { xs: 5, md: 4 }, px: { xs: 2, md: 3 }, pb: 2 }}>
      <Backdrop game={game} />
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'center', sm: 'flex-end' },
          gap: { xs: 2, sm: 3 },
          textAlign: { xs: 'center', sm: 'left' },
        }}
      >
        <Box sx={{ width: { xs: 148, sm: 168, md: 190 }, flexShrink: 0 }}>
          <GameCover game={game} variant="hero" radius={10} />
        </Box>
        <Box sx={{ minWidth: 0, pb: { sm: 0.5 } }}>
          <Typography
            variant="h1"
            component="h2"
            sx={{ fontFamily: DISPLAY_FONT, fontSize: { xs: '1.625rem', md: '2rem' }, lineHeight: 1.12, overflowWrap: 'anywhere' }}
          >
            {game.title}
            {game.me?.favorite ? (
              <FavoriteIcon titleAccess="Favourite" sx={{ ml: 1, fontSize: '0.8em', verticalAlign: '-0.08em', color: 'error.main' }} />
            ) : null}
          </Typography>
          <Typography sx={{ color: 'text.secondary', mt: 0.75, fontSize: '0.875rem' }}>
            {[year, devs.join(', ')].filter(Boolean).join(' · ') || 'Details not filled in yet'}
          </Typography>
          {pubs.length ? (
            <Typography sx={{ color: 'text.muted', fontSize: '0.75rem', mt: 0.25 }}>Published by {pubs.join(', ')}</Typography>
          ) : null}
          {platforms.length ? (
            <PlatformChips platforms={platforms} max={6} long sx={{ mt: 1.25, justifyContent: { xs: 'center', sm: 'flex-start' } }} />
          ) : (
            <Typography sx={{ color: 'text.muted', fontSize: '0.75rem', mt: 1 }}>No copies recorded — add one under Copies.</Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
}

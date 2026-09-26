/**
 * A game's box art at 3:4, or its title plate when there is none (or when the
 * image fails to load — a broken cover falls back to the plate, never to an
 * empty box). Drawn with a 2px ink keyline, the sticker's die-cut edge.
 */
import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { yearOf } from '../utils/dates';
import TitlePlate from './TitlePlate';

export function primaryPlatform(game) {
  return game?.copies?.[0]?.platform || game?.platformsAvailable?.[0] || null;
}

export default function GameCover({ game, variant = 'card', radius = 6, sx, children }) {
  const url = game?.coverUrl || null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const showImage = Boolean(url) && !failed;

  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: '3 / 4',
        borderRadius: `${radius}px`,
        overflow: 'hidden',
        bgcolor: 'background.raised',
        // Arcade Sticker: the box art gets an ink keyline, not a soft drop.
        border: (t) => `2px solid ${t.palette.arcade?.ink ?? '#000'}`,
        ...sx,
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          data-testid="game-cover-img"
          onError={() => setFailed(true)}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <TitlePlate title={game?.title} platform={primaryPlatform(game)} year={yearOf(game)} variant={variant} />
      )}
      {children}
    </Box>
  );
}

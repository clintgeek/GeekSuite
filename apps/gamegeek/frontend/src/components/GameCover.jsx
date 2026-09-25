/**
 * A game's box art at 3:4, or its title plate when there is none (or when the
 * image fails to load — a broken cover falls back to the plate, never to an
 * empty box).
 */
import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { yearOf } from '../utils/dates';
import TitlePlate from './TitlePlate';

export function primaryPlatform(game) {
  return game?.copies?.[0]?.platform || game?.platformsAvailable?.[0] || null;
}

export default function GameCover({ game, variant = 'card', radius = 8, sx, children }) {
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
        boxShadow: (t) => (t.palette.mode === 'dark' ? '0 8px 20px rgba(0,0,0,0.45)' : '0 6px 16px rgba(21,26,34,0.14)'),
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

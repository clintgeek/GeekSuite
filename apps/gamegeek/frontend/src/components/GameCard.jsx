/**
 * One game in the library grid.
 *
 * The cover, title and meta are one button (the whole card opens the game).
 * The shelf + stars line sits OUTSIDE that button as its own row — a control
 * inside a <button> is invalid HTML and every star tap would open the game.
 */
import React from 'react';
import { Box, ButtonBase, Card, Typography, alpha, useTheme } from '@mui/material';
import { AccessTime as ClockIcon, Favorite as FavoriteIcon } from '@mui/icons-material';
import { formatHours } from '../utils/dates';
import { shelfLabel } from '../utils/vocab';
import GameCover from './GameCover';
import PlatformChips, { copyPlatforms } from './PlatformChips';
import ShelfTag from './ShelfTag';
import StarRating from './StarRating';
import { canRate, metaLine } from './gameDisplay';

export default function GameCard({ game, onOpen, onRate, showShelf = true, customShelves = [] }) {
  const theme = useTheme();
  const title = game.title || 'Untitled';
  const me = game.me || {};
  const hours = formatHours(me.hoursPlayed);
  const progress = Number.isFinite(me.progress) ? Math.min(100, Math.max(0, me.progress)) : 0;
  const rateable = Boolean(onRate) && canRate(game);
  const shelf = showShelf && me.shelf ? shelfLabel(me.shelf, customShelves) : null;
  const meta = metaLine(game);

  return (
    <Card
      component="article"
      data-testid="game-card"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: theme.transitions.create(['transform', 'border-color', 'box-shadow'], { duration: 160 }),
        '@media (hover: hover)': {
          '&:hover': {
            transform: 'translateY(-2px)',
            borderColor: alpha(theme.palette.primary.main, 0.45),
          },
        },
      }}
    >
      <ButtonBase
        onClick={() => onOpen?.(game)}
        aria-label={title}
        sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1, pb: 0.75, borderRadius: 'inherit' }}
      >
        <GameCover game={game}>
          {me.favorite ? (
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%',
                display: 'grid', placeItems: 'center', bgcolor: 'rgba(14,17,22,0.72)', color: '#FF8FA3',
              }}
            >
              <FavoriteIcon sx={{ fontSize: 14 }} />
            </Box>
          ) : null}
          {progress > 0 ? (
            <Box aria-hidden="true" sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, bgcolor: 'rgba(0,0,0,0.45)' }}>
              <Box sx={{ height: '100%', width: `${progress}%`, bgcolor: '#FFB547', boxShadow: '0 0 8px rgba(255,181,71,0.6)' }} />
            </Box>
          ) : null}
        </GameCover>

        <Typography
          component="h3"
          sx={{
            mt: 1,
            fontSize: '0.875rem',
            fontWeight: 600,
            lineHeight: 1.3,
            color: 'text.primary',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </Typography>
        {meta ? (
          <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
            {meta}
          </Typography>
        ) : null}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, mt: 0.75, minHeight: 22 }}>
          <PlatformChips platforms={copyPlatforms(game)} max={2} sx={{ flexWrap: 'nowrap', overflow: 'hidden' }} />
          {hours ? (
            <Box
              component="span"
              aria-label={`${hours} played`}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, flexShrink: 0, fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
            >
              <ClockIcon aria-hidden="true" sx={{ fontSize: 13 }} />
              {hours}
            </Box>
          ) : null}
        </Box>
      </ButtonBase>

      {(shelf || rateable) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, px: 1, pb: rateable ? 0 : 1, mt: 'auto', minWidth: 0 }}>
          {shelf ? <ShelfTag shelf={me.shelf} label={shelf} sx={{ flex: '0 1 auto' }} /> : <span />}
          {rateable ? (
            <Box sx={{ width: 88, flexShrink: 0 }}>
              <StarRating value={me.rating} label={title} onChange={(n) => onRate(game, n)} />
            </Box>
          ) : null}
        </Box>
      )}
    </Card>
  );
}

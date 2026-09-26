/**
 * One game in the library grid.
 *
 * The cover, title and meta are one button (the whole card opens the game).
 * The shelf + stars line sits OUTSIDE that button as its own row — a control
 * inside a <button> is invalid HTML and every star tap would open the game.
 *
 * Arcade Sticker: 2px outline, a hard offset shadow in the card's own pop
 * colour (keyed by title, so a grid reads as a set of colours), and on a real
 * pointer the card lifts and leans a degree toward its own side. No lift on
 * touch (hover: none) and none at all under prefers-reduced-motion.
 */
import React from 'react';
import { Box, ButtonBase, Card, Typography, useTheme } from '@mui/material';
import { AccessTime as ClockIcon, Favorite as FavoriteIcon } from '@mui/icons-material';
import { hardShadow, POP_COLOURS } from '../theme/theme';
import { formatHours } from '../utils/dates';
import { plateFor } from '../utils/titlePlate';
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
  const arcade = theme.palette.arcade;
  const { index, lean } = plateFor(title);
  const pop = POP_COLOURS[index % POP_COLOURS.length];
  const isDark = theme.palette.mode === 'dark';
  // Dark: the shadow IS the colour. Light: ink at rest, colour when lifted.
  const rest = hardShadow(4, isDark ? pop : arcade.shadow);

  return (
    <Card
      component="article"
      data-testid="game-card"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: rest,
        '@media (hover: hover)': {
          '&:hover, &:focus-within': { boxShadow: hardShadow(6, pop) },
        },
        '@media (hover: hover) and (prefers-reduced-motion: no-preference)': {
          transition: 'transform 140ms cubic-bezier(.3,1.6,.6,1), box-shadow 140ms ease-out',
          '&:hover': { transform: `translate(-2px, -3px) rotate(${lean * 0.9}deg)` },
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
                position: 'absolute', top: 6, right: 6, width: 26, height: 26, borderRadius: '50%',
                display: 'grid', placeItems: 'center', bgcolor: arcade.magenta, color: arcade.ink,
                border: `2px solid ${arcade.ink}`, boxShadow: hardShadow(2, arcade.ink), zIndex: 2,
              }}
            >
              <FavoriteIcon sx={{ fontSize: 14 }} />
            </Box>
          ) : null}
          {progress > 0 ? (
            <Box aria-hidden="true" sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, bgcolor: arcade.ink, zIndex: 2 }}>
              <Box sx={{ height: '100%', width: `${progress}%`, bgcolor: arcade.lime, borderRight: progress < 100 ? `2px solid ${arcade.ink}` : 0 }} />
            </Box>
          ) : null}
        </GameCover>

        <Typography
          component="h3"
          sx={{
            mt: 1,
            fontSize: '0.9375rem',
            fontWeight: 800,
            lineHeight: 1.25,
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

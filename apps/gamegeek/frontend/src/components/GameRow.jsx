/**
 * One game in the list view — built for scanning and rating in a pass: a
 * small cover, title, one meta line, and the stars in their own column down
 * the right edge. The opening button and the stars are siblings, never nested.
 */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { formatHours, relativeInstant } from '../utils/dates';
import { platformShort, shelfLabel } from '../utils/vocab';
import GameCover from './GameCover';
import { copyPlatforms } from './PlatformChips';
import ShelfTag from './ShelfTag';
import StarRating from './StarRating';
import { canRate, metaLine } from './gameDisplay';

export default function GameRow({ game, onOpen, onRate, showShelf = true, customShelves = [] }) {
  const title = game.title || 'Untitled';
  const me = game.me || {};
  const hours = formatHours(me.hoursPlayed);
  const platforms = copyPlatforms(game).map(platformShort).join(' · ');
  const rateable = Boolean(onRate) && canRate(game);
  const shelf = showShelf && me.shelf ? shelfLabel(me.shelf, customShelves) : null;
  const last = me.lastPlayedAt ? relativeInstant(me.lastPlayedAt) : null;
  const detail = [platforms, hours, last && `Played ${last.toLowerCase()}`].filter(Boolean).join(' · ');

  return (
    <Box
      component="li"
      data-testid="game-row"
      sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider', listStyle: 'none' }}
    >
      <ButtonBase
        onClick={() => onOpen?.(game)}
        aria-label={title}
        sx={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          gap: 1.5, py: 1, px: 1, textAlign: 'left', borderRadius: '8px',
        }}
      >
        <Box sx={{ width: 44, flexShrink: 0 }}>
          <GameCover game={game} variant="thumb" radius={5} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            component="h3"
            sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.3, color: 'text.primary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {title}
          </Typography>
          <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            {metaLine(game) || ' '}
          </Typography>
          {(shelf || detail) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              {shelf ? <ShelfTag shelf={me.shelf} label={shelf} surface="default" sx={{ flexShrink: 0 }} /> : null}
              {detail ? (
                <Typography noWrap component="span" sx={{ fontSize: '0.75rem', color: 'text.muted', minWidth: 0 }}>
                  {detail}
                </Typography>
              ) : null}
            </Box>
          )}
        </Box>
      </ButtonBase>
      <Box sx={{ width: { xs: 112, sm: 150 }, flexShrink: 0, pr: { xs: 0.5, sm: 1 } }}>
        {rateable ? <StarRating value={me.rating} label={title} variant="row" onChange={(n) => onRate(game, n)} /> : null}
      </Box>
    </Box>
  );
}

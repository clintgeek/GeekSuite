/**
 * WhatNextShelf — "what should I play", above the library grid
 * (DOCS/WHAT_NEXT_SPEC.md).
 *
 * Modelled on BookGeek's: the gateway computes the candidate set (owned,
 * unplayed) and the model only ranks it and writes the one-line reason, so
 * a card here can be a bad suggestion but never a game already played.
 * Shape: a horizontally scrolling strip of real `GameCard`s, each carrying
 * its `why`; the header carries the "AI-picked"/fallback provenance line
 * and the optional mood box — submit re-runs the query with `mood`.
 *
 * Off by default: the caller renders nothing unless the "Play assistant"
 * switch in Settings is on.
 */
import React, { useState } from 'react';
import { Box, Button, Chip, Skeleton, TextField, Typography } from '@mui/material';
import { AutoAwesome as SparkleIcon } from '@mui/icons-material';
import GameCard from './GameCard';
import { whatNextProvenanceLine } from '../utils/playAssistant';

/** 150px keeps two and a bit cards on the narrowest phone — a strip, not a grid. */
const CARD_WIDTH = 150;

export default function WhatNextShelf({
  picks,
  provenance,
  loading = false,
  error = null,
  onOpen,
  onRate,
  customShelves = [],
  onSubmitMood,
}) {
  const [moodText, setMoodText] = useState('');
  const submitMood = (event) => {
    event?.preventDefault?.();
    onSubmitMood?.(moodText);
  };
  const hasPicks = Array.isArray(picks) && picks.length > 0;
  if (!loading && !error && !hasPicks) return null;

  return (
    <Box component="section" aria-labelledby="what-next-heading" sx={{ mb: 2, px: { xs: 2, md: 3 }, pt: { xs: 0.5, md: 2 } }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          columnGap: 1,
          rowGap: 0.25,
        }}
      >
        <Typography
          id="what-next-heading"
          component="h2"
          sx={{ fontSize: '1.0625rem', lineHeight: 1.2, textTransform: 'uppercase' }}
        >
          What should I play?
        </Typography>
        <Chip
          icon={<SparkleIcon />}
          label="AI-picked"
          size="small"
          variant="outlined"
          sx={{ height: 22, '& .MuiChip-label': { fontSize: '0.75rem', px: 0.75 } }}
        />
        {onSubmitMood ? (
          <Box
            component="form"
            onSubmit={submitMood}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: 'auto' }}
          >
            <TextField
              value={moodText}
              onChange={(e) => setMoodText(e.target.value)}
              placeholder="Mood? short, co-op, chill…"
              size="small"
              inputProps={{ maxLength: 200, 'aria-label': 'Mood for suggestions' }}
              sx={{ width: { xs: 160, sm: 220 }, '& .MuiInputBase-root': { height: 44, fontSize: '0.8125rem' } }}
            />
            <Button type="submit" size="small" variant="outlined" sx={{ minHeight: 44 }}>
              Ask
            </Button>
          </Box>
        ) : null}
        {whatNextProvenanceLine(provenance) ? (
          <Typography variant="caption" sx={{ color: 'text.secondary', width: '100%' }}>
            {whatNextProvenanceLine(provenance)}
          </Typography>
        ) : null}
      </Box>

      {error ? (
        <Typography role="status" variant="caption" sx={{ display: 'block', pt: 0.5, color: 'error.main' }}>
          {error}
        </Typography>
      ) : null}

      <Box
        sx={{
          display: 'flex',
          gap: 1.5,
          pt: 1,
          pb: 0.5,
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
            <Box key={i} sx={{ flex: `0 0 ${CARD_WIDTH}px`, width: CARD_WIDTH }}>
              <Skeleton
                variant="rectangular"
                sx={{ width: '100%', aspectRatio: '3 / 4', borderRadius: '8px' }}
              />
              <Skeleton variant="text" sx={{ mt: 1, width: '85%' }} />
              <Skeleton variant="text" sx={{ width: '60%' }} />
            </Box>
          ))
          : picks.map((pick) => (
            <Box
              key={pick.gameId}
              sx={{
                flex: `0 0 ${CARD_WIDTH}px`,
                width: CARD_WIDTH,
                scrollSnapAlign: 'start',
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
              }}
            >
              <GameCard game={pick.game} onOpen={onOpen} onRate={onRate} customShelves={customShelves} />
              {pick.why ? (
                <Typography
                  variant="caption"
                  component="p"
                  sx={{
                    color: 'text.secondary',
                    lineHeight: 1.35,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {pick.why}
                </Typography>
              ) : null}
            </Box>
          ))}
      </Box>
    </Box>
  );
}

/**
 * WhatNextSheet — "what should I play", on demand (DOCS/WHAT_NEXT_SPEC.md).
 *
 * UX rework 2026-10-03: this used to be a rail of full-size cards that
 * loaded with the library on every visit. Now nothing is asked until the
 * header's `WhatNextButton` is tapped, and the answer opens in a `GeekSheet`
 * (bottom sheet on a phone, dialog on desktop) as compact rows: cover,
 * title, meta line and the whole `why`.
 *
 * The gateway computes the candidate set (owned, unplayed) and the model only
 * ranks it and writes the one-line reason, so a row here can be a bad
 * suggestion but never a game already played. Off by default: the caller
 * renders nothing unless the "Play assistant" switch in Settings is on.
 */
import React, { useEffect, useState } from 'react';
import { Box, Button, ButtonBase, IconButton, Skeleton, TextField, Typography } from '@mui/material';
import { AutoAwesome as SparkleIcon } from '@mui/icons-material';
import { GeekSheet } from '@geeksuite/ui';
import GameCover from './GameCover';
import { metaLine } from './gameDisplay';
import { whatNextProvenanceLine } from '../utils/playAssistant';

function PickRow({ pick, onOpen }) {
  const game = pick.game;
  const title = game.title || 'Untitled';
  const meta = metaLine(game);
  return (
    <Box component="li" data-testid="what-next-pick" sx={{ listStyle: 'none', borderBottom: 1, borderColor: 'divider' }}>
      <ButtonBase
        onClick={() => onOpen?.(game)}
        aria-label={title}
        sx={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 1.5, px: 0.5, py: 1.5, textAlign: 'left', borderRadius: '8px' }}
      >
        <Box sx={{ width: 56, flexShrink: 0 }}>
          <GameCover game={game} variant="thumb" radius={5} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            component="h3"
            sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3, color: 'text.primary', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {title}
          </Typography>
          {meta ? (
            <Typography noWrap sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {meta}
            </Typography>
          ) : null}
          {pick.why ? (
            <Typography component="p" sx={{ fontSize: '0.875rem', color: 'text.secondary', mt: 0.5, lineHeight: 1.4 }}>
              {pick.why}
            </Typography>
          ) : null}
        </Box>
      </ButtonBase>
    </Box>
  );
}

export default function WhatNextSheet({
  open,
  onClose,
  picks,
  provenance,
  loading = false,
  error = null,
  mood = null,
  onSubmitMood,
  onOpen,
}) {
  const [moodText, setMoodText] = useState(mood || '');
  // Re-opening shows the mood that produced the list underneath it.
  useEffect(() => {
    if (open) setMoodText(mood || '');
  }, [open, mood]);

  const submitMood = (event) => {
    event?.preventDefault?.();
    onSubmitMood?.(moodText);
  };
  const hasPicks = Array.isArray(picks) && picks.length > 0;
  const provenanceLine = whatNextProvenanceLine(provenance);

  return (
    <GeekSheet
      open={Boolean(open)}
      onClose={onClose}
      title="What should I play?"
      description={(!loading && provenanceLine) || 'Suggestions from your backlog and ratings'}
      bodySx={{ pt: 0 }}
    >
      {onSubmitMood ? (
        <Box component="form" onSubmit={submitMood} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <TextField
            value={moodText}
            onChange={(e) => setMoodText(e.target.value)}
            placeholder="In the mood for… (short, co-op, chill)"
            size="small"
            fullWidth
            inputProps={{ maxLength: 200, 'aria-label': 'Mood for suggestions' }}
            sx={{ '& .MuiInputBase-root': { height: 44 } }}
          />
          <Button type="submit" variant="outlined" disabled={loading} sx={{ minHeight: 44, flexShrink: 0 }}>
            Ask
          </Button>
        </Box>
      ) : null}

      {error ? (
        <Typography role="status" sx={{ fontSize: '0.875rem', color: 'error.main', py: 1 }}>
          {error}
        </Typography>
      ) : null}

      {loading ? (
        <Box aria-busy="true" aria-label="Finding suggestions">
          {Array.from({ length: 3 }).map((_, i) => (
            <Box key={i} sx={{ display: 'flex', gap: 1.5, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
              <Skeleton variant="rectangular" sx={{ width: 56, height: 75, borderRadius: '5px', flexShrink: 0 }} />
              <Box sx={{ flex: 1 }}>
                <Skeleton variant="text" sx={{ width: '70%' }} />
                <Skeleton variant="text" sx={{ width: '40%' }} />
                <Skeleton variant="text" sx={{ width: '90%' }} />
              </Box>
            </Box>
          ))}
        </Box>
      ) : hasPicks ? (
        <Box component="ul" sx={{ m: 0, p: 0 }}>
          {picks.map((pick) => (
            <PickRow key={pick.gameId} pick={pick} onOpen={onOpen} />
          ))}
        </Box>
      ) : !error ? (
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary', py: 2 }}>
          Nothing to suggest right now — no unplayed games in the library.
        </Typography>
      ) : null}
    </GeekSheet>
  );
}

/**
 * The header control that opens the sheet: a round icon on a phone, where
 * the header row is already full, and a labelled pill on desktop.
 */
export function WhatNextButton({ onClick, isDesktop = false, label = 'What should I play?' }) {
  return isDesktop ? (
    <Button variant="outlined" onClick={onClick} startIcon={<SparkleIcon sx={{ fontSize: 18 }} />} sx={{ minHeight: 44, borderRadius: '999px', px: 2, whiteSpace: 'nowrap' }}>
      What next?
    </Button>
  ) : (
    <IconButton onClick={onClick} aria-label={label} sx={{ width: 44, height: 44, border: 1, borderColor: 'border', borderRadius: '999px', color: 'text.primary' }}>
      <SparkleIcon sx={{ fontSize: 20 }} />
    </IconButton>
  );
}

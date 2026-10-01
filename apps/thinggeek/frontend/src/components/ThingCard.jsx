/**
 * One thing in the photo grid: a box on the pallet rack. The card is a
 * cardboard box face sitting on a wooden pallet, with its photo (or the box
 * itself, stencilled with its size), the name, the type, where it is as a
 * "TO:" moving label (the last crumb), a quiet due line when something is
 * coming up, and a couple of tags. Vehicles and boats get the yellow
 * OVERSIZE LOAD banner across the top. The whole card is one button —
 * nothing interactive inside.
 */
import React from 'react';
import { Box, ButtonBase, Card, Typography, useTheme } from '@mui/material';
import DueLine, { dueSummary } from './DueLine';
import TagChips from './TagChips';
import ThingPhoto from './ThingPhoto';
import { AttentionDot, PlaceLabel, needsAttention } from './ThingRow';
import { coverSrc } from './thingDisplay';
import { DISPLAY_FONT, STENCIL_FONT, dustImage } from '../theme/theme';
import { boxMarks } from '../utils/boxMarks';
import { whereLabel } from '../utils/where';

/** The pallet under every box: three wooden boards and the gaps between them. */
export const PALLET_PX = 9;
const pallet = (dark) =>
  `linear-gradient(90deg, ${dark ? '#4A3622' : '#8A6236'} 0 30%, transparent 30% 35%, ${dark ? '#553E27' : '#9B6F3E'} 35% 65%, transparent 65% 70%, ${dark ? '#4A3622' : '#8A6236'} 70% 100%)`;

function OversizeBanner() {
  return (
    <Box
      aria-hidden="true"
      data-testid="oversize-banner"
      data-caption="OVERSIZE LOAD"
      sx={{
        position: 'absolute',
        top: 8,
        left: 8,
        right: 8,
        height: 22,
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'oversize.ground',
        color: 'oversize.ink',
        border: '2px solid',
        borderColor: 'oversize.ink',
        '&::before': { content: 'attr(data-caption)', fontFamily: STENCIL_FONT, fontSize: '0.75rem', letterSpacing: '0.14em', lineHeight: 1 },
      }}
    />
  );
}

export default function ThingCard({ thing, onOpen }) {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const name = thing.name || 'Untitled';
  const where = whereLabel(thing);
  const attention = needsAttention(thing);
  const marks = boxMarks(thing);
  const label = [name, thing.type?.name, where ? `in ${where}` : null, attention ? dueSummary(thing.nextDue) : null].filter(Boolean).join(', ');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', pb: `${PALLET_PX}px`, position: 'relative' }}>
      <Card
        component="article"
        data-testid="thing-card"
        data-size={marks.size ?? ''}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          backgroundImage: dustImage(theme.palette.mode),
          transition: theme.transitions.create(['transform'], { duration: 160 }),
          '@media (hover: hover)': {
            '&:hover': { transform: 'translateY(-3px)' },
          },
        }}
      >
        <ButtonBase
          onClick={() => onOpen?.(thing)}
          aria-label={label}
          sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', flex: 1, width: '100%', textAlign: 'left', p: 1, pb: 1.25, borderRadius: 'inherit' }}
        >
          <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} marks={marks} radius={2}>
            {marks.size === 'OVERSIZE' ? <OversizeBanner /> : null}
            {attention ? <AttentionDot status={thing.nextDue?.status} sx={{ position: 'absolute', bottom: 8, right: 8, width: 16, height: 16 }} /> : null}
          </ThingPhoto>
          <Typography
            component="h3"
            sx={{
              mt: 1,
              px: 0.25,
              fontFamily: DISPLAY_FONT,
              fontSize: '0.9375rem',
              fontWeight: 700,
              lineHeight: 1.3,
              color: 'text.primary',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, px: 0.25, mt: 0.5, minWidth: 0 }}>
            {thing.type?.name ? (
              <Typography component="span" noWrap sx={{ fontSize: '0.8125rem', color: 'text.secondary' }}>
                {thing.type.name}
              </Typography>
            ) : null}
            <PlaceLabel thing={thing} sx={{ minWidth: 0 }} />
          </Box>
          <DueLine nextDue={thing.nextDue} sx={{ px: 0.25, mt: 0.75 }} />
          {thing.tags?.length ? <TagChips tags={thing.tags} max={2} sx={{ px: 0.25, mt: 1, flexWrap: 'nowrap', overflow: 'hidden' }} /> : null}
        </ButtonBase>
      </Card>
      {/* The pallet it stands on. */}
      <Box aria-hidden="true" sx={{ position: 'absolute', left: 6, right: 6, bottom: 0, height: PALLET_PX, backgroundImage: pallet(dark), borderTop: `2px solid ${dark ? '#2C2015' : '#6B4A26'}` }} />
    </Box>
  );
}

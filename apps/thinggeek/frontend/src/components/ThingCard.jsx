/**
 * One thing in the photo grid: a card-stock card on the kraft desk with its
 * photo (or type plate), name, type, where it is as a strip of Dymo tape
 * (the last crumb), a quiet due line when something is coming up, and a
 * couple of tags. The whole card is one button — nothing interactive inside.
 */
import React from 'react';
import { Box, ButtonBase, Card, Typography, alpha, useTheme } from '@mui/material';
import DueLine, { dueSummary } from './DueLine';
import TagChips from './TagChips';
import ThingPhoto from './ThingPhoto';
import { AttentionDot, PlaceTape, needsAttention } from './ThingRow';
import { coverSrc } from './thingDisplay';
import { whereLabel } from '../utils/where';

export default function ThingCard({ thing, onOpen }) {
  const theme = useTheme();
  const name = thing.name || 'Untitled';
  const where = whereLabel(thing);
  const attention = needsAttention(thing);
  const label = [name, thing.type?.name, where ? `in ${where}` : null, attention ? dueSummary(thing.nextDue) : null].filter(Boolean).join(', ');

  return (
    <Card
      component="article"
      data-testid="thing-card"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: theme.transitions.create(['transform', 'border-color'], { duration: 160 }),
        '@media (hover: hover)': {
          '&:hover': { transform: 'translateY(-2px)', borderColor: alpha(theme.palette.text.primary, 0.4) },
        },
      }}
    >
      <ButtonBase
        onClick={() => onOpen?.(thing)}
        aria-label={label}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', flex: 1, width: '100%', textAlign: 'left', p: 1, pb: 1.25, borderRadius: 'inherit' }}
      >
        <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} radius={4}>
          {attention ? <AttentionDot sx={{ position: 'absolute', top: 8, right: 8, width: 14, height: 14 }} /> : null}
        </ThingPhoto>
        <Typography
          component="h3"
          sx={{
            mt: 1,
            px: 0.25,
            fontSize: '0.9375rem',
            fontWeight: 600,
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
          <PlaceTape thing={thing} sx={{ minWidth: 0 }} />
        </Box>
        <DueLine nextDue={thing.nextDue} sx={{ px: 0.25, mt: 0.75 }} />
        {thing.tags?.length ? <TagChips tags={thing.tags} max={2} sx={{ px: 0.25, mt: 1, flexWrap: 'nowrap', overflow: 'hidden' }} /> : null}
      </ButtonBase>
    </Card>
  );
}

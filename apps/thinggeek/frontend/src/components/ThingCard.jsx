/**
 * One thing in the library grid: its photo (or type plate), name, what and
 * where it is, a quiet due line when something is coming up, and a couple of
 * tags. The whole card is one button — nothing interactive inside it.
 */
import React from 'react';
import { Box, ButtonBase, Card, Typography, alpha, useTheme } from '@mui/material';
import DueLine from './DueLine';
import TagChips from './TagChips';
import ThingPhoto from './ThingPhoto';
import { coverSrc, thingMetaLine } from './thingDisplay';

export default function ThingCard({ thing, onOpen }) {
  const theme = useTheme();
  const name = thing.name || 'Untitled';
  const meta = thingMetaLine(thing);

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
          '&:hover': { transform: 'translateY(-2px)', borderColor: alpha(theme.palette.primary.main, 0.45) },
        },
      }}
    >
      <ButtonBase
        onClick={() => onOpen?.(thing)}
        aria-label={meta ? `${name}, ${meta}` : name}
        sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start', flex: 1, width: '100%', textAlign: 'left', p: 1, pb: 1.25, borderRadius: 'inherit' }}
      >
        <ThingPhoto src={coverSrc(thing)} icon={thing.type?.icon} />
        <Typography
          component="h3"
          sx={{
            mt: 1.25,
            px: 0.25,
            fontSize: '0.9375rem',
            fontWeight: 700,
            lineHeight: 1.3,
            letterSpacing: '-0.005em',
            color: 'text.primary',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {name}
        </Typography>
        {meta ? (
          <Typography noWrap sx={{ px: 0.25, fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
            {meta}
          </Typography>
        ) : null}
        <DueLine nextDue={thing.nextDue} sx={{ px: 0.25, mt: 0.75 }} />
        {thing.tags?.length ? <TagChips tags={thing.tags} max={2} sx={{ px: 0.25, mt: 1, flexWrap: 'nowrap', overflow: 'hidden' }} /> : null}
      </ButtonBase>
    </Card>
  );
}

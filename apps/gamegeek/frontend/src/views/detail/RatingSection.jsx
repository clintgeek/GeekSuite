/** My rating (and the verdict that goes with it lives in Notes & review). */
import React, { forwardRef } from 'react';
import { Box, Button, Typography } from '@mui/material';
import StarRating from '../../components/StarRating';
import Section from './Section';

const RatingSection = forwardRef(function RatingSection({ game, onRate }, ref) {
  const rating = game.me?.rating;
  const rated = typeof rating === 'number' && rating > 0;
  return (
    <Section
      title="My rating"
      id="rating"
      action={
        rated ? (
          <Button onClick={() => onRate(game, null)} sx={{ color: 'text.secondary', minHeight: 44 }}>
            Clear
          </Button>
        ) : null
      }
    >
      <Box ref={ref} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ width: 220, maxWidth: '70%' }}>
          <StarRating value={rating} label={game.title} variant="hero" allowClear onChange={(n) => onRate(game, n)} />
        </Box>
        <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
          {rated ? `${rating} of 5` : 'Not rated'}
        </Typography>
      </Box>
    </Section>
  );
});

export default RatingSection;

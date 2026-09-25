/** My rating (and the verdict that goes with it lives in Notes & review). */
import React, { forwardRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import StarRating from '../../components/StarRating';
import { ratingMeaningLine } from '../../utils/tasteModel';
import Section from './Section';

const RatingSection = forwardRef(function RatingSection({ game, onRate }, ref) {
  const rating = game.me?.rating;
  const rated = typeof rating === 'number' && rating > 0;
  // While a pointer is hovering a star, that preview wins; a keyboard commit
  // changes `rating` itself, so this falls straight back to it without a
  // separate focus-preview step.
  const [preview, setPreview] = useState(null);
  const shown = preview ?? (rated ? rating : null);
  const line = shown ? ratingMeaningLine(shown) : null;

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
      <Box ref={ref} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box sx={{ width: 220, maxWidth: '70%' }}>
          <StarRating value={rating} label={game.title} variant="hero" allowClear onChange={(n) => onRate(game, n)} onPreview={setPreview} />
        </Box>
        <Typography aria-live="polite" sx={{ fontSize: '0.8125rem', color: 'text.secondary', minHeight: '1.5em', lineHeight: 1.4 }}>
          {line || (rated ? `${rating} of 5` : 'Not rated')}
        </Typography>
      </Box>
    </Section>
  );
});

export default RatingSection;

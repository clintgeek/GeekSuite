/**
 * "↑ 3 new stories": the paper was refreshed while the reader was down the
 * page (usePaperRefresh), so instead of reordering under their thumb this
 * bar waits at the top of the view, sticky. Tapping it goes up and prints
 * the new edition. Ink on newsprint, inverted — a stop-press slip: square
 * (2px), a hairline of newsprint inside its edge instead of a drop shadow.
 */
import React from 'react';
import { Box, ButtonBase } from '@mui/material';
import { GOTHIC } from '../theme/theme';

const newStoriesLabel = (count) => `${count} new ${count === 1 ? 'story' : 'stories'}`;

export default function NewStoriesBar({ count, onShow }) {
  if (!count) return null;
  return (
    <Box
      role="status"
      data-testid="new-stories"
      sx={{ position: 'sticky', top: 8, zIndex: 3, height: 0, display: 'flex', justifyContent: 'center', overflow: 'visible' }}
    >
      <ButtonBase
        onClick={onShow}
        aria-label={`Show ${newStoriesLabel(count)}`}
        sx={{
          mt: 2,
          minHeight: 44,
          px: 5,
          borderRadius: '2px',
          bgcolor: 'text.primary',
          color: 'background.default',
          fontFamily: GOTHIC,
          fontSize: '0.875rem',
          fontWeight: 700,
          boxShadow: (t) => `inset 0 0 0 1px ${t.palette.background.default}, 0 0 0 1px ${t.palette.text.primary}`,
          '&:focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 },
        }}
      >
        {`↑ ${newStoriesLabel(count)}`}
      </ButtonBase>
    </Box>
  );
}

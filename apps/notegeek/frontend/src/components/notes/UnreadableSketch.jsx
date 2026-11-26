import React from 'react';
import { Box } from '@mui/material';
import { GeekErrorState } from '@geeksuite/ui';

export const UNREADABLE_TITLE = "This note can't be opened";
export const UNREADABLE_TEXT = "Its saved writing couldn't be read. It has not been changed, and nothing will be written to it until it opens.";

/**
 * A handwritten note whose stored body could not be read. No canvas, no
 * "start fresh": the original is still on the server and must stay there.
 */
export default function UnreadableSketch({ onRetry, title = UNREADABLE_TITLE, description = UNREADABLE_TEXT }) {
  return (
    <Box data-testid="sketch-unreadable" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', p: 2 }}>
      <GeekErrorState title={title} description={description} onRetry={onRetry} retryLabel="Try again" />
    </Box>
  );
}

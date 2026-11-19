/**
 * The yard's own empty and error states (2026-11-18 review: the motif is on
 * every screen, empties and failures included).
 *
 *   YardErrorState  the shared GeekErrorState (its copy, Retry and roles),
 *                   with a shut unit door and a CLOSED plate for its glyph
 *                   instead of the stock warning triangle.
 *   ClosedUnit      that door and plate on their own, for an empty state.
 */
import React from 'react';
import { Box } from '@mui/material';
import { GeekErrorState } from '@geeksuite/ui';
import { MiniDoor } from './StorageUnit';
import { LIVERY, STENCIL_FONT } from '../theme/theme';

export function ClosedUnit({ size = 56, plate = 'CLOSED', sx }) {
  return (
    <Box aria-hidden="true" data-testid="closed-unit" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 0.75, ...sx }}>
      <MiniDoor size={size} />
      {plate ? (
        <Box
          component="span"
          data-caption={plate}
          sx={{
            px: 0.75,
            py: '1px',
            bgcolor: LIVERY.ink,
            color: LIVERY.orange,
            border: `1.5px solid ${LIVERY.orange}`,
            borderRadius: '2px',
            fontFamily: STENCIL_FONT,
            fontSize: '0.75rem',
            letterSpacing: '0.12em',
            lineHeight: 1.4,
            // the plate's word drawn by CSS: decoration, not a second announcement
            '&::before': { content: 'attr(data-caption)' },
          }}
        />
      ) : null}
    </Box>
  );
}

export function YardErrorState(props) {
  return <GeekErrorState icon={<ClosedUnit />} iconSx={{ color: 'inherit' }} data-testid="yard-error" {...props} />;
}

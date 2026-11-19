/**
 * The sticky action bar: Shelf · Rate · ⋯. Three equal 44px+ targets, 12px
 * labels, in the thumb's reach and pinned under the hero as the sheet scrolls.
 * No "Log session" (S-D2, 2026-11-16: Chef doesn't track playtime).
 *
 * Review 2026-11-18: the shelf button wears that shelf's own icon (the
 * drawer's), not a bookmark for every shelf, and it is called "Shelf" like
 * the drawer, the filters and the sheet (#6). Pinned, the bar keeps clear of
 * the sheet's close button at the top right (#2).
 */
import React from 'react';
import { Box, Button } from '@mui/material';
import { shelfIconFor } from '../../components/shelfIcons';
import {
  MoreHoriz as MoreIcon,
  StarBorder as RateIcon,
  Star as RatedIcon,
} from '@mui/icons-material';

const BAR_BUTTON_SX = {
  minWidth: 0,
  minHeight: 52,
  px: 0.5,
  py: 0.75,
  flexDirection: 'column',
  gap: 0.25,
  fontSize: '0.75rem',
  fontWeight: 600,
  lineHeight: 1.2,
  color: 'text.primary',
  borderRadius: '10px',
  '& .MuiSvgIcon-root': { fontSize: 20 },
};

/** The sheet's close: 44px at 8px from the right edge, plus a 4px gap. */
export const CLOSE_CLEARANCE = '56px';

export default function ActionBar({ shelf, shelfName, rating, onStatus, onRate, onMore }) {
  const ShelfIcon = shelfIconFor(shelf);
  return (
    <Box
      data-testid="detail-actions"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 0.5,
        pl: { xs: 1, md: 2 },
        pr: CLOSE_CLEARANCE,
        py: 0.5,
        bgcolor: 'background.paper',
        borderTop: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Button onClick={onStatus} sx={BAR_BUTTON_SX} aria-label={`Shelf: ${shelfName}. Change`}>
        <ShelfIcon data-shelf-icon={shelf || 'unshelved'} sx={{ color: 'primary.main' }} />
        <Box component="span" sx={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shelfName}
        </Box>
      </Button>
      <Button onClick={onRate} sx={BAR_BUTTON_SX} aria-label={rating ? `Rating: ${rating} of 5. Change` : 'Rate'}>
        {rating ? <RatedIcon sx={{ color: 'star' }} /> : <RateIcon sx={{ color: 'primary.main' }} />}
        {rating ? `${rating} / 5` : 'Rate'}
      </Button>
      <Button onClick={onMore} sx={BAR_BUTTON_SX} aria-label="More actions">
        <MoreIcon />
        More
      </Button>
    </Box>
  );
}

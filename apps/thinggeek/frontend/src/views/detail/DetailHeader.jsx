/**
 * Who this thing is: name, type (icon + name), where it lives (the whole
 * path, a link into the library filtered to that place), and its tags.
 */
import React from 'react';
import { Box, Link, Typography } from '@mui/material';
import { PlaceOutlined as PlaceIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import TagChips from '../../components/TagChips';
import TypeIcon from '../../components/TypeIcon';
import { DISPLAY_FONT } from '../../theme/theme';
import { libraryLinkWith } from '../../utils/libraryFilter';
import { placeLabel } from '../../utils/places';

export default function DetailHeader({ thing }) {
  const place = thing.place ? placeLabel(thing.place) : null;
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pt: 2, pb: 1.75 }}>
      <Typography
        variant="h1"
        component="h2"
        data-testid="thing-name"
        sx={{ fontFamily: DISPLAY_FONT, fontSize: { xs: '1.625rem', md: '2rem' }, lineHeight: 1.12, overflowWrap: 'anywhere' }}
      >
        {thing.name}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 0.75, color: 'text.secondary', fontSize: '0.875rem' }}>
        {thing.type ? (
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
            <TypeIcon name={thing.type.icon} sx={{ fontSize: 18, color: 'primary.main' }} />
            {thing.type.name}
          </Box>
        ) : null}
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
          <PlaceIcon aria-hidden="true" sx={{ fontSize: 18 }} />
          {place ? (
            <Link component={RouterLink} to={libraryLinkWith('places', thing.place.id)} underline="hover" sx={{ color: 'text.primary', fontWeight: 500, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
              {place}
            </Link>
          ) : (
            <span>No place yet</span>
          )}
        </Box>
      </Box>
      {thing.tags?.length ? <TagChips tags={thing.tags} linked sx={{ mt: 1 }} /> : null}
    </Box>
  );
}

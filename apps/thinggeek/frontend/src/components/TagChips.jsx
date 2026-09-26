/**
 * A thing's tags as small ledger chips. On a card they are quiet labels (the
 * card is one button, so no links inside it); on the detail page each is a
 * link into the library filtered by that tag.
 */
import React from 'react';
import { Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { libraryLinkWith } from '../utils/libraryFilter';

const chipSx = {
  display: 'inline-flex',
  alignItems: 'center',
  maxWidth: '100%',
  px: 0.875,
  borderRadius: '6px',
  border: 1,
  borderColor: 'border',
  color: 'text.secondary',
  fontSize: '0.75rem',
  fontWeight: 500,
  lineHeight: '20px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  textDecoration: 'none',
};

export default function TagChips({ tags = [], max = Infinity, linked = false, sx }) {
  if (!tags.length) return null;
  const shown = tags.slice(0, max);
  const more = tags.length - shown.length;
  return (
    <Box component="ul" aria-label="Tags" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, m: 0, p: 0, listStyle: 'none', minWidth: 0, ...sx }}>
      {shown.map((tag) => (
        <Box component="li" key={tag} sx={{ minWidth: 0, display: 'flex' }}>
          {linked ? (
            <Box
              component={RouterLink}
              to={libraryLinkWith('tags', tag)}
              sx={{ ...chipSx, minHeight: { xs: 44, md: 32 }, minWidth: { xs: 44, md: 0 }, justifyContent: 'center', lineHeight: 1, px: 1.25, color: 'text.primary', '&:hover': { borderColor: 'primary.main' } }}
            >
              {tag}
            </Box>
          ) : (
            <Box component="span" sx={chipSx}>
              {tag}
            </Box>
          )}
        </Box>
      ))}
      {more > 0 ? (
        <Box component="li" sx={{ ...chipSx, border: 0, px: 0.25 }}>
          +{more}
        </Box>
      ) : null}
    </Box>
  );
}

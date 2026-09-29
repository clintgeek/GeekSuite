import React from 'react';
import { Box } from '@mui/material';
import { noteTypeMeta } from './noteTypeMeta';

/**
 * TypeIcon — a note's type as a small graphite glyph with an accessible name
 * ("Sketch note"). Graphite's replacement for the Lab Notebook's coloured
 * type stamps: the type is still there on every row, it just no longer
 * competes with the title.
 *
 * `role="img"` + `aria-label` so a screen reader says the type; the glyph
 * itself is decorative. The colour is `text.secondary`, which clears 4.5:1 on
 * every ground (graphics only need 3:1).
 */
function TypeIcon({ type, size = 16, sx, ...rest }) {
  const meta = noteTypeMeta(type || 'text');
  const Icon = meta.Icon;
  return (
    <Box
      component="span"
      role="img"
      aria-label={meta.aria || `${meta.long} note`}
      title={meta.long}
      data-note-type={type || 'text'}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'text.secondary',
        lineHeight: 0,
        ...sx,
      }}
      {...rest}
    >
      <Icon aria-hidden sx={{ fontSize: size }} />
    </Box>
  );
}

export default TypeIcon;

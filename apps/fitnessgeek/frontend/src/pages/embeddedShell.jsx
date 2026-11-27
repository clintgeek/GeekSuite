import React from 'react';
import { Box } from '@mui/material';
import { Page } from '../components/primitives';

/**
 * The outer wrapper of a page that can also live inside a container page
 * (Trends, Saved foods). Standalone it is the usual <Page>; `embedded` swaps
 * it for a plain column with the same gap, so the container's one <Page>
 * supplies the padding and width and nothing doubles.
 */
export default function Shell({ embedded = false, children, ...rest }) {
  if (!embedded) return <Page {...rest}>{children}</Page>;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 4, md: 5 } }}>
      {children}
    </Box>
  );
}

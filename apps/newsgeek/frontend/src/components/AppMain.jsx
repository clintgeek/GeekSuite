/**
 * The scrolling <main> column: the newsprint every page is set on. Arriving
 * on a route starts at its top. A centred measure keeps lines readable on a
 * wide screen — a paper's column, not a dashboard.
 */
import React, { useLayoutEffect, useState } from 'react';
import { Box } from '@mui/material';

export default function AppMain({ children, transitionKey }) {
  const [node, setNode] = useState(null);
  useLayoutEffect(() => {
    if (node) node.scrollTop = 0;
  }, [node, transitionKey]);
  return (
    <Box
      component="main"
      ref={setNode}
      sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', bgcolor: 'background.default' }}
    >
      <Box key={transitionKey} sx={{ minHeight: '100%', animation: 'ng-fade-in 160ms ease-out' }}>
        {children}
      </Box>
    </Box>
  );
}

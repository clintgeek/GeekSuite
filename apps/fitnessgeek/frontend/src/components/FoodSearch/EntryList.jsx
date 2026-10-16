import React from 'react';
import { Box, Button, Typography } from '@mui/material';

/**
 * What was just logged, one line per entry: the name, its calories, and Fix.
 * Shared by the composer's result card (Simple) and the "Just added" strip
 * on a meal card (Full), so the two can't drift apart.
 */
export default function EntryList({ items = [], onFix, busy = false }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.logId || item.name}
          data-testid="entry-row"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 48 }}
        >
          <Typography sx={{ flex: 1, minWidth: 0, fontSize: '1.0625rem', fontWeight: 700, color: 'text.primary', overflowWrap: 'anywhere', lineHeight: 1.3 }}>
            {item.name}
          </Typography>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {Math.round(item.calories || 0).toLocaleString('en-US')} cal
          </Typography>
          {onFix && item.logId && (
            <Button
              variant="outlined"
              onClick={() => onFix(item)}
              disabled={busy}
              aria-label={`Fix ${item.name}`}
              sx={{ minHeight: 44, minWidth: 64, borderRadius: 999, fontWeight: 800, fontSize: '0.9375rem', flexShrink: 0 }}
            >
              Fix
            </Button>
          )}
        </Box>
      ))}
    </Box>
  );
}

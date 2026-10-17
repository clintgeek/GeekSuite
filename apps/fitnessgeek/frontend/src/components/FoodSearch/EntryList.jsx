import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { withAmount } from './entries.js';
import { mealLabel } from '../../utils/plainWords.js';

/**
 * What was just logged, one line per entry: the name, its calories, and Fix.
 * Shared by the composer's result card (Simple) and the "Just added" strip
 * on a meal card (Full), so the two can't drift apart.
 *
 * The name carries its amount when it isn't one ("Egg ×2", L4). `showMeal`
 * names each row's meal, for a sentence whose entries landed in different
 * meals (L6): one header naming one meal was wrong for the rest.
 */
export default function EntryList({ items = [], onFix, busy = false, showMeal = false }) {
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {items.map((item) => (
        <Box
          component="li"
          key={item.logId || item.name}
          data-testid="entry-row"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 48 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, color: 'text.primary', overflowWrap: 'anywhere', lineHeight: 1.3 }}>
              {withAmount(item.name, item.servings)}
            </Typography>
            {showMeal && item.mealType && (
              <Typography data-testid="entry-meal" sx={{ fontSize: '0.9375rem', color: 'text.secondary', lineHeight: 1.3 }}>
                {mealLabel(item.mealType)}
              </Typography>
            )}
          </Box>
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

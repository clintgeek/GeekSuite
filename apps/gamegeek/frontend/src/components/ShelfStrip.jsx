/**
 * ShelfStrip — the shelf nav on a phone: a horizontally scrolling chip row,
 * All · Playing · Backlog · … · custom, with counts. Hidden at md+, where the
 * sidebar already lists the shelves. "Unshelved" only appears when it has
 * something in it.
 *
 * The chip is paint; the ButtonBase around it is the 44px target and the one
 * element with role="tab". Arcade Sticker: 2px outlines; the active shelf is
 * a lime sticker with ink text and a hard shadow (ink on lime is 17:1, so the
 * 12px count clears AA against the fill itself).
 */
import React, { useEffect, useRef } from 'react';
import { Box, ButtonBase, useTheme } from '@mui/material';
import { shelfCount } from '../hooks/useGameMeta';

export function stripEntries(shelves, stats) {
  const entries = [{ id: 'all', label: 'All' }, ...shelves];
  if ((stats?.unshelved ?? 0) > 0) entries.push({ id: 'unshelved', label: 'Unshelved' });
  return entries;
}

export default function ShelfStrip({ shelves, stats, value, onChange }) {
  const theme = useTheme();
  const a = theme.palette.arcade;
  const activeRef = useRef(null);
  const entries = stripEntries(shelves, stats);

  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [value]);

  return (
    <Box
      role="tablist"
      aria-label="Shelves"
      sx={{
        display: { xs: 'flex', md: 'none' },
        gap: 0.75,
        px: 2,
        py: 0.5,
        pb: 1,
        overflowX: 'auto',
        scrollSnapType: 'x proximity',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        maskImage: 'linear-gradient(90deg, #000 calc(100% - 24px), transparent)',
      }}
    >
      {entries.map((shelf) => {
        const active = value === shelf.id;
        const count = shelfCount(stats, shelf.id);
        return (
          <ButtonBase
            key={shelf.id}
            ref={active ? activeRef : undefined}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(shelf.id)}
            sx={{ flex: '0 0 auto', minHeight: 44, borderRadius: '999px', scrollSnapAlign: 'start' }}
          >
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                height: 32,
                px: 1.5,
                borderRadius: '8px',
                border: '2px solid',
                fontSize: '0.8125rem',
                fontWeight: active ? 800 : 600,
                whiteSpace: 'nowrap',
                ...(active
                  ? { bgcolor: a.lime, borderColor: a.ink, color: a.ink, boxShadow: `3px 3px 0 0 ${theme.palette.mode === 'dark' ? a.magenta : a.ink}` }
                  : { bgcolor: 'background.paper', borderColor: 'border', color: 'text.secondary' }),
              }}
            >
              {shelf.label}
              {count ? (
                <Box component="span" sx={{ fontSize: '0.75rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: active ? a.ink : 'text.muted' }}>
                  {count}
                </Box>
              ) : null}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

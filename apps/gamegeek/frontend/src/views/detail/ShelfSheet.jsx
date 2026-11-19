/**
 * Pick a shelf. One 48px row per shelf, the current one checked.
 *
 * Arcade Sticker (review 2026-11-18 #4): each row wears the same status
 * sticker the card does, and the shelf the game is on is an ink-outlined tile
 * with a hard shadow — not a grey band with a colour square.
 */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { GeekSheet } from '@geeksuite/ui';
import ShelfTag from '../../components/ShelfTag';
import { hardShadow } from '../../theme/theme';
import { shelfMeaning } from '../../utils/tasteModel';

function ShelfOption({ shelf, selected, onPick, sticker = true }) {
  const meaning = shelfMeaning(shelf.id);
  const accessibleName = meaning ? `${shelf.label} — ${meaning.short}` : shelf.label;
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        onClick={() => onPick(shelf.id)}
        aria-pressed={selected}
        aria-label={accessibleName}
        sx={{
          width: '100%', minHeight: 48, px: 1.5, py: meaning ? 1 : 0.5, borderRadius: '10px', justifyContent: 'flex-start', gap: 1.5,
          border: '2px solid',
          borderColor: selected ? 'border' : 'transparent',
          bgcolor: selected ? 'background.card' : 'transparent',
          boxShadow: selected ? (t) => hardShadow(3, t.palette.arcade.shadow) : 'none',
          '&:hover': { bgcolor: selected ? 'background.card' : 'action.hover' },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          {sticker ? (
            <Box aria-hidden="true" sx={{ display: 'flex', py: 0.25 }}>
              <ShelfTag shelf={shelf.id} label={shelf.label} sx={{ fontSize: '0.8125rem', height: 24 }} />
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.3 }}>{shelf.label}</Typography>
          )}
          {meaning ? (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.35, mt: 0.125 }}>{meaning.short}</Typography>
          ) : null}
        </Box>
        {selected ? <CheckIcon sx={{ fontSize: 20, color: 'text.primary', flexShrink: 0, alignSelf: meaning ? 'flex-start' : 'center', mt: meaning ? 0.25 : 0 }} aria-hidden="true" /> : null}
      </ButtonBase>
    </Box>
  );
}

export default function ShelfSheet({ open, onClose, shelves, value, onPick, gameTitle }) {
  return (
    <GeekSheet open={open} onClose={onClose} title="Move to shelf" description={gameTitle}>
      <Box component="ul" sx={{ m: 0, p: 0, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {shelves.map((s) => (
          <ShelfOption key={s.id} shelf={s} selected={value === s.id} onPick={onPick} />
        ))}
        {value ? (
          <ShelfOption shelf={{ id: 'unshelved', label: 'Take it off my shelves' }} selected={false} sticker={false} onPick={() => onPick(null)} />
        ) : null}
      </Box>
    </GeekSheet>
  );
}

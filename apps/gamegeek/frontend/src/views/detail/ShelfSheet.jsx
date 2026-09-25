/** Pick a shelf. One 48px row per shelf, the current one checked. */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { GeekSheet } from '@geeksuite/ui';
import { useShelfTone } from '../../components/ShelfTag';

function ShelfOption({ shelf, selected, onPick }) {
  const { dot } = useShelfTone(shelf.id, 'paper');
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        onClick={() => onPick(shelf.id)}
        aria-pressed={selected}
        sx={{
          width: '100%', minHeight: 48, px: 1.5, borderRadius: '10px', justifyContent: 'flex-start', gap: 1.5,
          bgcolor: selected ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: dot, flexShrink: 0 }} />
        <Typography sx={{ flex: 1, textAlign: 'left', fontSize: '0.9375rem', fontWeight: selected ? 600 : 400 }}>{shelf.label}</Typography>
        {selected ? <CheckIcon sx={{ fontSize: 20, color: 'text.primary' }} aria-hidden="true" /> : null}
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
          <ShelfOption shelf={{ id: 'unshelved', label: 'Take it off my shelves' }} selected={false} onPick={() => onPick(null)} />
        ) : null}
      </Box>
    </GeekSheet>
  );
}

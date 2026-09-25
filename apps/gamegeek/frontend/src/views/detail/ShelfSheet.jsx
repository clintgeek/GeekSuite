/** Pick a shelf. One 48px row per shelf, the current one checked. */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { Check as CheckIcon } from '@mui/icons-material';
import { GeekSheet } from '@geeksuite/ui';
import { useShelfTone } from '../../components/ShelfTag';
import { shelfMeaning } from '../../utils/tasteModel';

function ShelfOption({ shelf, selected, onPick }) {
  const { dot } = useShelfTone(shelf.id, 'paper');
  const meaning = shelfMeaning(shelf.id);
  const accessibleName = meaning ? `${shelf.label} — ${meaning.short}` : shelf.label;
  return (
    <Box component="li" sx={{ listStyle: 'none' }}>
      <ButtonBase
        onClick={() => onPick(shelf.id)}
        aria-pressed={selected}
        aria-label={accessibleName}
        sx={{
          width: '100%', minHeight: 48, px: 1.5, py: meaning ? 0.75 : 0, borderRadius: '10px', justifyContent: 'flex-start', gap: 1.5,
          bgcolor: selected ? 'action.selected' : 'transparent', '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box aria-hidden="true" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: dot, flexShrink: 0, mt: meaning ? 0.5 : 0, alignSelf: meaning ? 'flex-start' : 'center' }} />
        <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <Typography sx={{ fontSize: '0.9375rem', fontWeight: selected ? 600 : 400, lineHeight: 1.3 }}>{shelf.label}</Typography>
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
          <ShelfOption shelf={{ id: 'unshelved', label: 'Take it off my shelves' }} selected={false} onPick={() => onPick(null)} />
        ) : null}
      </Box>
    </GeekSheet>
  );
}

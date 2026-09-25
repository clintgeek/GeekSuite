/**
 * The library's empty states. Three different situations, three different
 * sentences — "you have no games" is not the same as "nothing matches".
 */
import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Add as AddIcon, CloudDownloadOutlined as ImportIcon } from '@mui/icons-material';
import SavePointMark from '../components/SavePointMark';
import { shelfLabel } from '../utils/vocab';

const SHELF_HINTS = {
  playing: 'Log a session on anything and it lands here.',
  backlog: 'New games start here — the pile of good intentions.',
  finished: 'Credits rolled? Move a game here and it keeps the hours.',
  'on-hold': 'For the ones you mean to go back to.',
  abandoned: "No shame. Some games aren't for you.",
  wishlist: "Games you want but don't own yet.",
  unshelved: 'Games someone else in the household added that you have not shelved.',
};

function Frame({ children }) {
  return (
    <Box
      sx={{
        mx: 'auto',
        mt: { xs: 2, md: 6 },
        maxWidth: 460,
        textAlign: 'center',
        px: 3,
        py: { xs: 4, md: 5 },
        borderRadius: 3,
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        backgroundImage: (t) =>
          `radial-gradient(120% 70% at 50% 0%, ${t.palette.phosphor?.glow ?? 'transparent'}, transparent 70%)`,
      }}
    >
      {children}
    </Box>
  );
}

export default function LibraryEmpty({ narrowed, libraryEmpty, shelf, shelves, onAdd, onClear, onImport }) {
  if (libraryEmpty && !narrowed) {
    return (
      <Frame>
        <SavePointMark size={56} sx={{ mx: 'auto', mb: 2.5 }} />
        <Typography variant="h2" component="h2" sx={{ fontSize: '1.5rem', mb: 1 }}>
          A blank save file
        </Typography>
        <Typography sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>
          Add the first game by searching its title, or bring your whole Playnite library in at once — hours and all.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>
            Add a game
          </Button>
          <Button variant="outlined" startIcon={<ImportIcon />} onClick={onImport} sx={{ color: 'text.primary' }}>
            Import from Playnite
          </Button>
        </Box>
        <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem', mt: 3 }}>
          On GOG, Epic, Amazon or Luna and not on Playnite? Add game → <b>Paste a list</b> takes a whole library of titles at once.
        </Typography>
      </Frame>
    );
  }

  const onlyShelf = shelf && shelf !== 'all';
  const label = onlyShelf ? shelfLabel(shelf, shelves.filter((s) => s.custom)) : null;

  return (
    <Frame>
      <SavePointMark size={44} sx={{ mx: 'auto', mb: 2 }} />
      <Typography variant="h3" component="h2" sx={{ mb: 1 }}>
        {onlyShelf ? `Nothing on ${label} yet` : 'No games match'}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3, lineHeight: 1.6 }}>
        {onlyShelf ? SHELF_HINTS[shelf] || 'Move a game onto this shelf from its detail page.' : 'Try a shorter search, or loosen the filters.'}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={onClear} sx={{ color: 'text.primary' }}>
          Show all games
        </Button>
        <Button variant="contained" startIcon={<AddIcon />} onClick={onAdd}>
          Add a game
        </Button>
      </Box>
    </Frame>
  );
}

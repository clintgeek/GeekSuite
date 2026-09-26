/**
 * The library's empty states. Three different situations, three different
 * sentences — "you have no games" is not the same as "nothing matches".
 *
 * Arcade Sticker: the frame is a tilted sticker card with a hard magenta
 * shadow and a blinking-cursor "attract mode" tag above the headline (the
 * blink stops under prefers-reduced-motion). The tag is decoration, so it is
 * aria-hidden; the sentences below it carry the meaning.
 */
import React from 'react';
import { Box, Button, Typography, useTheme } from '@mui/material';
import { DISPLAY_FONT, hardShadow } from '../theme/theme';
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
  const theme = useTheme();
  const a = theme.palette.arcade;
  return (
    <Box
      data-testid="library-empty"
      sx={{
        mx: 'auto',
        mt: { xs: 3, md: 6 },
        maxWidth: 460,
        textAlign: 'center',
        px: 3,
        py: { xs: 4, md: 5 },
        borderRadius: '12px',
        border: `2px solid ${theme.palette.border}`,
        bgcolor: 'background.paper',
        boxShadow: hardShadow(6, a.magenta),
        transform: 'rotate(-0.6deg)',
        backgroundImage: `radial-gradient(${theme.palette.mode === 'dark' ? 'rgba(34,228,255,0.10)' : 'rgba(20,17,26,0.06)'} 1.2px, transparent 1.6px)`,
        backgroundSize: '14px 14px',
      }}
    >
      {children}
    </Box>
  );
}

/** "PRESS START_" — an arcade attract-mode tag. Ink on lime, 17:1. */
function AttractTag({ children }) {
  const theme = useTheme();
  const a = theme.palette.arcade;
  return (
    <Box
      aria-hidden="true"
      sx={{
        display: 'inline-block',
        mb: 2,
        px: 1.25,
        py: 0.5,
        fontFamily: DISPLAY_FONT,
        fontSize: '0.8125rem',
        letterSpacing: '0.08em',
        color: a.ink,
        bgcolor: a.lime,
        border: `2px solid ${a.ink}`,
        borderRadius: '4px',
        boxShadow: hardShadow(3, a.ink),
        transform: 'rotate(2deg)',
        '&::after': {
          content: '"_"',
          animation: 'gg-blink 1s steps(1) infinite',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        },
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
        <SavePointMark size={56} sx={{ mx: 'auto', mb: 2 }} />
        <AttractTag>Player 1 · press start</AttractTag>
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
      </Frame>
    );
  }

  const onlyShelf = shelf && shelf !== 'all';
  const label = onlyShelf ? shelfLabel(shelf, shelves.filter((s) => s.custom)) : null;

  return (
    <Frame>
      <SavePointMark size={44} sx={{ mx: 'auto', mb: 2 }} />
      <AttractTag>{onlyShelf ? 'Empty shelf' : 'Continue?'}</AttractTag>
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

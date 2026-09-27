/**
 * Annunciator — the alarm window grid. One engraved tile per kind of item
 * `GET /api/ai/status` can put on the attention list; a tile is lit when the
 * list holds at least one of its kind, with the count printed on it.
 *
 * Lit and dark tiles differ in more than colour: a lit tile carries its count
 * and the word ACTIVE, a dark one says CLEAR. The grid is a list, and each
 * tile's accessible text is its label and state.
 */
import { Box, Typography } from '@mui/material';
import { useLampTest } from './LampTest';

function tileColours(theme, tile, testing) {
  const isLight = theme.palette.mode === 'light';
  if (!tile.lit && !testing) {
    return {
      bg: isLight ? '#c3c9ce' : '#15181c',
      fg: isLight ? '#3b434c' : '#9ca3ac',
      edge: theme.palette.line.strong,
    };
  }
  // Lit: the lamp colour behind engraved ink. Night 11.6:1 (warn) / 9.25:1
  // (info); day uses the deeper lamps under white, 5.8:1 / 6.5:1.
  if (tile.severity === 'warn' || testing) {
    return isLight
      ? { bg: '#8a5300', fg: '#ffffff', edge: '#5e3900' }
      : { bg: theme.palette.box.lamp.warn, fg: '#14110a', edge: '#b8862a' };
  }
  return isLight
    ? { bg: '#1c58a3', fg: '#ffffff', edge: '#123d73' }
    : { bg: '#8fb8f2', fg: '#14110a', edge: '#4f7fc0' };
}

export default function Annunciator({ tiles }) {
  const testing = useLampTest();
  return (
    <Box
      component="ul"
      aria-label="Annunciator: what the AI status says needs attention"
      sx={{
        m: 0,
        p: '6px',
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(5, minmax(0, 1fr))' },
        gap: '6px',
        borderRadius: 1,
        bgcolor: 'box.tape.black',
      }}
    >
      {tiles.map((tile) => (
        <Box
          component="li"
          key={tile.kind}
          sx={(theme) => {
            const c = tileColours(theme, tile, testing);
            const isLight = theme.palette.mode === 'light';
            return {
              listStyle: 'none',
              minHeight: 56,
              px: 1,
              py: 0.75,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              borderRadius: '3px',
              bgcolor: c.bg,
              color: c.fg,
              border: `1px solid ${c.edge}`,
              boxShadow: (tile.lit || testing) && !isLight ? `0 0 14px ${c.bg}66, inset 0 0 8px rgba(255,255,255,0.35)` : 'inset 0 1px 3px rgba(0,0,0,0.45)',
              transition: 'background-color 200ms ease, box-shadow 200ms ease',
            };
          }}
        >
          <Typography component="span" sx={{ fontFamily: 'fontFamilyMono', fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.2, color: 'inherit' }}>
            {tile.label}
          </Typography>
          <Typography component="span" sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', lineHeight: 1.3, color: 'inherit' }}>
            {tile.lit ? `${tile.count} active` : 'clear'}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/**
 * The selectable pill for single- and multi-select chip groups (photo role,
 * document role, date kind…). Selected is an accent TINT with an accent
 * border and TEXT-token ink — contrast never depends on the accent (the
 * 12px filled-chip landmine). 44px in both axes.
 */
import { alpha } from '@mui/material/styles';

/** An rgba() tint over an opaque hex ground, as an opaque rgb(). */
export function mixOver(tint, ground) {
  const m = /rgba?\(([^)]+)\)/.exec(tint);
  const g = ground.replace('#', '');
  if (!m || g.length !== 6) return tint;
  const [r, gr, b, a = 1] = m[1].split(',').map((v) => Number(v.trim()));
  const base = [0, 2, 4].map((i) => parseInt(g.slice(i, i + 2), 16));
  const mix = [r, gr, b].map((v, i) => Math.round(v * a + base[i] * (1 - a)));
  return `rgb(${mix.join(', ')})`;
}

export const selectChipSx = {
  flex: '0 0 auto',
  minHeight: 44,
  minWidth: 44,
  px: 1.75,
  ml: '0 !important',
  borderRadius: '999px !important',
  border: '1px solid !important',
  borderColor: (t) => `${t.palette.border} !important`,
  textTransform: 'none',
  fontSize: '0.8125rem',
  fontWeight: 500,
  color: 'text.secondary',
  // Card stock, so a chip reads the same on the kraft desk as on a sheet.
  bgcolor: 'background.paper',
  '&:hover': { bgcolor: 'background.paper', borderColor: (t) => `${t.palette.text.primary} !important` },
  '&.Mui-selected, &.Mui-selected:hover': {
    // The tint composited over card stock (a solid colour, so it stays opaque on kraft).
    bgcolor: (t) => mixOver(alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.1), t.palette.background.paper),
    borderColor: (t) => `${t.palette.primary.main} !important`,
    color: 'text.primary',
    fontWeight: 700,
  },
};

export const chipGroupSx = { display: 'flex', flexWrap: 'wrap', gap: 0.75, '& .MuiToggleButton-root': selectChipSx };

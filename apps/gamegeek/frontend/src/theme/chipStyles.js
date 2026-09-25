/**
 * The selectable pill used by every multi- or single-select chip group
 * (sort, platform, session length, owned platforms…).
 *
 * Selected is a phosphor TINT with an accent border and TEXT-token ink — not
 * a solid amber slab. A dozen solid amber pills in a row shout; a tint reads
 * as "on". Ink stays on text.primary so contrast never depends on the accent
 * (the 12px filled-chip landmine). 44px in both axes.
 */
import { alpha } from '@mui/material/styles';

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
  '&.Mui-selected, &.Mui-selected:hover': {
    bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.16 : 0.1),
    borderColor: (t) => `${t.palette.primary.main} !important`,
    color: 'text.primary',
    fontWeight: 600,
  },
};

export const chipGroupSx = { display: 'flex', flexWrap: 'wrap', gap: 0.75, '& .MuiToggleButton-root': selectChipSx };

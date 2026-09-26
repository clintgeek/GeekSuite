/**
 * The selectable pill for single- and multi-select chip groups (photo role,
 * document role, date kind…). Selected is an accent TINT with an accent
 * border and TEXT-token ink — contrast never depends on the accent (the
 * 12px filled-chip landmine). 44px in both axes.
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
    fontWeight: 700,
  },
};

export const chipGroupSx = { display: 'flex', flexWrap: 'wrap', gap: 0.75, '& .MuiToggleButton-root': selectChipSx };

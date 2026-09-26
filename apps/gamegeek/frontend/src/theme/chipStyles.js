/**
 * The selectable pill used by every multi- or single-select chip group
 * (sort, platform, session length, owned platforms…).
 *
 * Arcade Sticker: a 2px-outlined tile; selected is a solid LIME sticker with
 * ink text, an ink outline and a hard shadow. The fill is opaque and the ink
 * clears 17:1 on it, so the 13px label passes against the chip fill itself
 * (the 12px filled-chip landmine: never an accent tint, never readableOn
 * against the page). 44px in both axes.
 */
import { ARCADE, hardShadow } from './theme';

export const selectChipSx = {
  flex: '0 0 auto',
  minHeight: 44,
  minWidth: 44,
  px: 1.75,
  ml: '0 !important',
  borderRadius: '8px !important',
  border: '2px solid !important',
  borderColor: (t) => `${t.palette.border} !important`,
  textTransform: 'none',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'text.secondary',
  '&.Mui-selected, &.Mui-selected:hover': {
    bgcolor: ARCADE.lime,
    borderColor: `${ARCADE.ink} !important`,
    color: ARCADE.ink,
    fontWeight: 800,
    boxShadow: (t) => hardShadow(2, t.palette.mode === 'dark' ? ARCADE.magenta : ARCADE.ink),
  },
};

export const chipGroupSx = { display: 'flex', flexWrap: 'wrap', gap: 0.75, '& .MuiToggleButton-root': selectChipSx };

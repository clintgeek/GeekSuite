/**
 * Safe accessors for NoteGeek's custom theme tokens.
 *
 * `createNoteTheme` is the source of truth for `noteTypes`, `surfaces`,
 * `glow` and `border`. Components must never read those straight off
 * `theme.palette`, because any consumer rendering under a plain MUI theme
 * (tests, Storybook, a partially-loaded @geeksuite/ui bundle) would hard
 * crash on `undefined.soft`. These helpers degrade to sane MUI-native
 * values instead.
 */
import { alpha } from '@mui/material/styles';

const FALLBACK_NOTE_TYPE = 'text';

/** Editor surfaces: default page, card/chrome, and the writing sheet. */
export function surfaces(theme) {
  const { palette } = theme;
  return (
    palette.surfaces || {
      default: palette.background?.default,
      paper: palette.background?.paper,
      elevated: palette.background?.paper,
    }
  );
}

/** Focus ring / hover wash derived from the accent colour. */
export function glow(theme) {
  const { palette } = theme;
  if (palette.glow) return palette.glow;
  const accent = palette.primary?.main || '#000000';
  return {
    ring: alpha(accent, 0.2),
    soft: alpha(accent, 0.06),
    medium: alpha(accent, 0.1),
    border: alpha(accent, 0.3),
  };
}

/** 1px component border token. */
export function border(theme) {
  return theme.palette.border || theme.palette.divider;
}

/**
 * Identity colour for a note type (the dot on rows, the type pill).
 * Falls back to the `text` type, then to the accent, so an unknown type
 * from the API still renders something meaningful.
 */
export function noteTypeColor(theme, type) {
  const map = theme.palette.noteTypes;
  if (!map) return theme.palette.text?.primary || theme.palette.primary?.main;
  return map[type] || map[FALLBACK_NOTE_TYPE] || theme.palette.primary?.main;
}

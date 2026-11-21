/**
 * paperLook.js — what PagePaper.jsx draws with: the page InkCanvas has on
 * screen (a context), the theme's paper colours, and the ruling as CSS.
 */
import { createContext, useMemo } from 'react';
import { useTheme } from '@mui/material';
import { MIN_SHEETS, RULE_SPACING, SHEET_HEIGHT } from './pageCamera';
import { RULED } from './pageTemplate';

/** What InkCanvas knows about the page on screen. */
export const InkPageContext = createContext({ template: RULED, pageHeight: SHEET_HEIGHT * MIN_SHEETS });

/** The diary theme's paper, ruling, printed words and ribbon; MUI's own for any other theme. */
export function usePaperColors() {
  const { palette } = useTheme();
  return useMemo(() => ({
    paper: palette.day?.page ?? palette.background.paper,
    line: palette.day?.rule ?? palette.divider,
    ink: palette.text.secondary,
    accent: palette.secondary.main,
    edge: palette.divider,
  }), [palette]);
}

const mod = (v, m) => ((v % m) + m) % m;

/**
 * Ruled lines at page y = 48k, as a CSS background for a layer whose top edge
 * is `layerTop` CSS px down the pane. Left out when the lines would be closer
 * than 6 px (a grey wash).
 */
export function rulingStyle(camera, line, layerTop = 0) {
  const step = RULE_SPACING * camera.z;
  if (step < 6) return {};
  return {
    backgroundImage: `linear-gradient(to bottom, ${line} 1px, transparent 1px)`,
    backgroundSize: `100% ${step}px`,
    backgroundPosition: `0 ${Math.round(mod(camera.y * camera.z - layerTop, step) * 100) / 100}px`,
  };
}

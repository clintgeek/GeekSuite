/**
 * paperLook.js — what PagePaper.jsx draws with: the page InkCanvas has on
 * screen (a context), the paper colours, and the ruling as CSS.
 */
import { createContext, useMemo } from 'react';
import { useTheme } from '@mui/material';
import { MIN_SHEETS, RULE_SPACING, SHEET_HEIGHT } from './pageCamera';
import { RULED } from './pageTemplate';
import { RIBBON, SURFACES } from '../theme/theme.js';

/**
 * What InkCanvas knows about the page on screen.
 *   paper       one of PAPER_CHOICES' ids
 *   preview     a template shown but not yet placed (a blank day), or null
 *   light       the page is drawn on light paper whatever the app theme
 *               (it has a template sheet; see `usePaperColors`)
 */
export const InkPageContext = createContext({ paper: RULED, preview: null, light: false, pageHeight: SHEET_HEIGHT * MIN_SHEETS });

/**
 * The diary theme's paper, ruling, printed words and ribbon; MUI's own for
 * any other theme.
 *
 * `light`: the diary's LIGHT paper even in the dark theme. A template sheet is
 * always white with dark print, and tldraw draws "black" ink near-white in its
 * dark scheme, so writing on a sheet would vanish. A page that has a sheet is
 * therefore a light page, whole: light paper, tldraw's light scheme.
 */
export function usePaperColors(light = false) {
  const { palette } = useTheme();
  return useMemo(() => {
    if (light && palette.mode === 'dark') {
      const s = SURFACES.light;
      return { paper: s.page, line: s.rule, ink: s.secondary, accent: RIBBON.light.main, edge: s.divider };
    }
    return {
      paper: palette.day?.page ?? palette.background.paper,
      line: palette.day?.rule ?? palette.divider,
      ink: palette.text.secondary,
      accent: palette.secondary.main,
      edge: palette.divider,
    };
  }, [palette, light]);
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

/**
 * DOCS/SUITE_TODO.md "notegeek mind-map off-palette colors": edge stroke,
 * MiniMap fills, and the root-node background used to be hardcoded hex that
 * ignored theme mode. They now come from `noteTypeColor(theme, 'mindmap')`
 * (theme/tokens.js) and `toneForMode` (@geeksuite/ui). This asserts:
 *  - the derived colors actually differ between modes (proof they're mode-
 *    aware, not just a renamed constant)
 *  - the root node's tinted background keeps text.primary at WCAG AA
 *    (>= 4.5:1) in both modes, per MOBILE_UI_PLAN contrast rules
 *
 * Contrast math mirrors packages/ui/src/__tests__/themeContrast.test.js
 * (flatten a translucent color over its surface, then MUI's own
 * getContrastRatio) without importing that suite — it lives in packages/ui,
 * out of scope for this app's test tree.
 */
import { describe, it, expect } from 'vitest';
import { alpha, decomposeColor, getContrastRatio, recomposeColor } from '@mui/material/styles';
import { createNoteTheme } from '../../theme/createAppTheme';
import { noteTypeColor } from '../../theme/tokens';

function flatten(color, surface) {
  const decomposed = decomposeColor(color);
  if (decomposed.values.length < 4) return color;
  const a = decomposed.values[3];
  if (a >= 1) return recomposeColor({ type: 'rgb', values: decomposed.values.slice(0, 3) });
  const base = decomposeColor(surface).values;
  const blended = decomposed.values
    .slice(0, 3)
    .map((v, i) => Math.round(v * a + base[i] * (1 - a)));
  return recomposeColor({ type: 'rgb', values: blended });
}

function ratio(fg, bg) {
  return getContrastRatio(flatten(fg, bg), bg);
}

// Mirrors the alpha values in MindMapNode.jsx's root-node `nodeBg`.
const ROOT_ALPHA = { light: 0.14, dark: 0.22 };

describe('mind-map palette (theme-driven, both modes)', () => {
  it('noteTypeColor(mindmap) differs between light and dark — proves it is mode-aware', () => {
    const light = createNoteTheme('light');
    const dark = createNoteTheme('dark');
    expect(noteTypeColor(light, 'mindmap')).not.toBe(noteTypeColor(dark, 'mindmap'));
  });

  it.each(['light', 'dark'])(
    'root node text.primary stays >= 4.5:1 over the tinted mindmap background (%s mode)',
    (mode) => {
      const theme = createNoteTheme(mode);
      const surface = theme.palette.background.default;
      const rootBg = alpha(noteTypeColor(theme, 'mindmap'), ROOT_ALPHA[mode]);
      const contrast = ratio(theme.palette.text.primary, flatten(rootBg, surface));
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
  );
});

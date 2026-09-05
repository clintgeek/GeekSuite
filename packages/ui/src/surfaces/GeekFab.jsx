/**
 * GeekFab — the app's primary action, living in the thumb zone.
 *
 * Rule from the mobile grammar (MOBILE_UI_PLAN.md §2 "New primitives"): an
 * app's create/do action is a 56px FAB pinned above the bottom nav, never
 * only a top-bar button. `right: 16px`, `bottom` reads the shell's
 * `bottomInset` (plus the safe-area inset) so it never sits on the iOS home
 * indicator or behind `GeekBottomNav`.
 *
 * Mount it as a sibling of `GeekAppFrame`, not inside it: the frame's route
 * transition is a framer-motion element, and an animating element becomes the
 * containing block for `position: fixed` children — a FAB inside it would be
 * positioned against the page and fade with it (same rule as the toasts).
 *
 * Inline SVG glyph, matching the rest of `packages/ui` chrome:
 * `@mui/icons-material` is not a dependency here, and shared chrome must not
 * add one.
 */
import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import Fab from '@mui/material/Fab';
import { geekMotion } from '../designTokens.js';
import { useGeekShell } from '../navigation/shellContext.js';
import { useFocusMode } from '../focus/index.js';

/** Default glyph: a plain "+". Drawn like `GeekThemeToggle`'s glyphs so a
 * caller-supplied `icon` and this one read as the same weight. */
function PlusGlyph() {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{
        display: 'block',
        width: 24,
        height: 24,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      <path d="M12 5v14M5 12h14" />
    </Box>
  );
}

/**
 * @param {string} label required; used as `aria-label`, and as the visible
 *   text when `extended` (shown at `sm`+, collapsed to icon-only at `xs`).
 * @param {import('react').ReactNode} [icon] defaults to an inline "+" glyph.
 * @param {() => void} [onClick]
 * @param {boolean} [extended=false] show `label` beside the icon at `sm`+.
 * @param {'mobile'|'always'} [showOn='mobile'] `'mobile'` hides at `md`+
 *   (the desktop top bar owns the action there); `'always'` never hides.
 * @param {boolean} [hidden=false] render nothing.
 * @param {number} [bottomInset] override for the shell's `bottomInset`.
 * @param {import('@mui/material').FabProps['color']} [color='primary']
 * @param {boolean} [disabled]
 * @param {object|Function} [sx] merged last, over this primitive's own sx.
 */
export const GeekFab = forwardRef(function GeekFab(
  {
    label,
    icon,
    onClick,
    extended = false,
    showOn = 'mobile',
    hidden = false,
    bottomInset,
    color = 'primary',
    disabled,
    sx,
    ...props
  },
  ref
) {
  const shell = useGeekShell();
  const { focusMode } = useFocusMode();
  const inset = bottomInset === undefined ? shell.bottomInset : bottomInset;

  if (hidden || focusMode) return null;

  return (
    <Fab
      ref={ref}
      color={color}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      data-geek-fab={extended ? 'extended' : 'icon'}
      sx={(theme) => ({
        position: 'fixed',
        right: '16px',
        bottom: `calc(16px + ${inset}px + env(safe-area-inset-bottom))`,
        width: extended ? { xs: 56, sm: 'auto' } : 56,
        height: 56,
        minHeight: 56,
        minWidth: 56,
        borderRadius: '16px', // squircle — not MUI's default circle/pill
        paddingInline: extended ? { xs: 0, sm: 3 } : 0,
        gap: extended ? 1 : 0,
        boxShadow: theme.shadows[6],
        '&:active': { boxShadow: theme.shadows[2] },
        zIndex: theme.zIndex.speedDial,
        transition: theme.transitions.create(['background-color', 'box-shadow', 'transform'], {
          duration: geekMotion.duration.base,
        }),
        display: showOn === 'always' ? 'inline-flex' : { xs: 'inline-flex', md: 'none' },
        ...(typeof sx === 'function' ? sx(theme) : sx),
      })}
      {...props}
    >
      {icon ?? <PlusGlyph />}
      {extended ? (
        <Box
          component="span"
          sx={{
            display: { xs: 'none', sm: 'inline' },
            fontSize: '0.875rem',
            fontWeight: 500,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </Box>
      ) : null}
    </Fab>
  );
});

import { forwardRef } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { geekLayout, geekShape } from '../designTokens.js';

/** Inline SVG glyphs — @mui/icons-material is not a peer dependency here, and
 * shared chrome must not add one. Both draw with `currentColor` so the button
 * inherits whatever the host top bar sets. */
function Glyph({ children }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      sx={{
        display: 'block',
        width: 20,
        height: 20,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }}
    >
      {children}
    </Box>
  );
}

function SunGlyph() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.5v2.25M12 19.25v2.25M4.22 4.22l1.6 1.6M18.18 18.18l1.6 1.6M2.5 12h2.25M19.25 12h2.25M4.22 19.78l1.6-1.6M18.18 5.82l1.6-1.6" />
    </Glyph>
  );
}

function MoonGlyph() {
  return (
    <Glyph>
      <path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8Z" />
    </Glyph>
  );
}

/**
 * Suite theme toggle. Deliberately stateless: this package must not import
 * `@geeksuite/user`, so the host app passes `mode` and `onToggle` down from
 * whichever theme context it uses.
 *
 * @param {'light'|'dark'} mode current resolved mode
 * @param {() => void} onToggle called on click
 */
export const GeekThemeToggle = forwardRef(function GeekThemeToggle(
  { mode = 'light', onToggle, sx, ...props },
  ref
) {
  const isDark = mode === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <Tooltip title={label}>
      <IconButton
        ref={ref}
        onClick={onToggle}
        aria-label={label}
        sx={{
          color: 'inherit',
          minWidth: geekLayout.minClickTarget,
          minHeight: geekLayout.minClickTarget,
          borderRadius: `${geekShape.radius.control}px`,
          ...sx,
        }}
        {...props}
      >
        {isDark ? <SunGlyph /> : <MoonGlyph />}
      </IconButton>
    </Tooltip>
  );
});

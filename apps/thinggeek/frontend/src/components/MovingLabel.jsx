/**
 * MovingLabel — the Moving Day signature: the printed label slapped on a
 * moving box. White stock, a burnt-orange header strip with a stencilled
 * caption, the name in heavy slab beneath. For place names: the breadcrumb,
 * the Where rows, a storage unit's door, the "Inside …" headers, the place
 * on a row ("TO: GARAGE").
 *
 *   variant="inline"   one line: [TO | Garage] — rows and crumbs
 *   variant="stacked"  the header strip over the name — headings, doors
 *
 * The caption says what the place is: ROOM for a location, BOX for a
 * container (or anything passed as `caption`, e.g. "TO" on a row).
 *
 * Real text, always: the label's textContent is exactly the name, as typed
 * (what getByText finds and a screen reader says). The caption is a box
 * marking, drawn with generated content from `data-caption`, so it adds
 * nothing to the text; the kind is in the accessible name of whatever holds
 * the label (the row, the crumb), never only in the stencil.
 *
 * The same stock in both modes (dimmed a touch at night) — it's paper.
 * Pairs are measured in __tests__/theme/movingDayContrast.test.js.
 */
import React from 'react';
import { Box, useTheme } from '@mui/material';
import { DISPLAY_FONT, LABEL, LIVERY, STENCIL_FONT, hashString } from '../theme/theme';

export const captionForKind = (kind) => (kind === 'container' ? 'BOX' : 'ROOM');

const SIZES = {
  sm: { name: '0.8125rem', cap: '0.75rem', padX: '6px', padY: '1px', minH: 22 },
  md: { name: '1rem', cap: '0.75rem', padX: '8px', padY: '2px', minH: 26 },
  lg: { name: '1.25rem', cap: '0.75rem', padX: '10px', padY: '3px', minH: 32 },
  xl: { name: '1.75rem', cap: '0.8125rem', padX: '14px', padY: '4px', minH: 42 },
};

/** A stable slap-on angle in [-1°, 1°] for a name (labels are never stuck on quite straight). */
export function labelTilt(text = '') {
  return ((hashString(text) % 21) - 10) / 10;
}

export default function MovingLabel({ children, kind = 'location', caption, size = 'md', variant = 'stacked', tilt = false, title, sx, component = 'span', ...rest }) {
  const theme = useTheme();
  const stock = LABEL[theme.palette.mode === 'dark' ? 'dark' : 'light'];
  const s = SIZES[size] ?? SIZES.md;
  const cap = caption ?? captionForKind(kind);
  const text = typeof children === 'string' ? children : '';
  const angle = tilt ? labelTilt(text) : 0;
  const inline = variant === 'inline';

  return (
    <Box
      component={component}
      data-testid="moving-label"
      data-kind={kind}
      data-caption={cap}
      data-variant={inline ? 'inline' : 'stacked'}
      title={title}
      sx={{
        display: 'inline-flex',
        flexDirection: inline ? 'row' : 'column',
        alignItems: 'stretch',
        maxWidth: '100%',
        minWidth: 0,
        verticalAlign: 'middle',
        bgcolor: stock.stock,
        color: stock.ink,
        border: `1px solid ${stock.edge}`,
        borderRadius: '2px',
        overflow: 'hidden',
        boxShadow: theme.palette.mode === 'dark' ? '0 1px 0 rgba(0,0,0,0.6), 0 2px 6px rgba(0,0,0,0.4)' : '0 1px 0 rgba(60,38,14,0.28), 0 2px 4px rgba(60,38,14,0.16)',
        transform: angle ? `rotate(${angle}deg)` : undefined,
        ...sx,
      }}
      {...rest}
    >
      {/* The caption strip: burnt orange, white stencil — a box marking, drawn
          from data-caption so it is never part of the label's text. */}
      <Box
        component="span"
        aria-hidden="true"
        data-caption={cap}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: inline ? 'center' : 'flex-start',
          flexShrink: 0,
          bgcolor: LIVERY.burnt,
          color: LIVERY.white,
          px: inline ? '5px' : s.padX,
          minHeight: inline ? undefined : 17,
          '&::before': {
            content: 'attr(data-caption)',
            fontFamily: STENCIL_FONT,
            fontSize: s.cap,
            lineHeight: 1,
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          },
        }}
      />
      <Box
        component="span"
        sx={{
          display: 'block',
          minWidth: 0,
          minHeight: s.minH,
          boxSizing: 'border-box',
          px: s.padX,
          py: s.padY,
          fontFamily: DISPLAY_FONT,
          fontWeight: 700,
          fontSize: s.name,
          // Zilla Slab's bold space is narrow; at label sizes "Shelf 2" read as "Shelf2".
          wordSpacing: '0.14em',
          lineHeight: inline ? `${s.minH - 2}px` : 1.25,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

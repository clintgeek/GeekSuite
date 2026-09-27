import { Box } from '@mui/material';

/**
 * D20 — the icosahedron, face-on: the Candlelit Table's motif. Used in the
 * wordmark, the dice result, the story cards and the empty states.
 *
 * Decorative by default (`aria-hidden`); a caller that shows a rolled value
 * says it in text next to the die as well, so the SVG number is never the
 * only place the result lives.
 */
export default function D20({ size = 24, value, color = 'currentColor', fill = 'none', strokeWidth = 1.3, sx }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      sx={{ display: 'block', flexShrink: 0, overflow: 'visible', ...sx }}
    >
      <g fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round">
        <path d="M12 1.6 21.4 7v10L12 22.4 2.6 17V7Z" fill={fill} />
        <path d="M12 7.4 17.2 16.1H6.8Z" />
        <path d="M12 1.6v5.8M2.6 7 12 7.4 21.4 7M2.6 7l4.2 9.1M21.4 7l-4.2 9.1M2.6 17l4.2-.9M21.4 17l-4.2-.9M6.8 16.1 12 22.4l5.2-6.3" strokeOpacity="0.7" />
      </g>
      {value != null && (
        <text
          x="12"
          y="14.9"
          textAnchor="middle"
          fontSize={String(value).length > 1 ? 5.6 : 6.4}
          fontWeight="700"
          fill={color}
          style={{ fontFamily: '"Alegreya Sans", system-ui, sans-serif', fontVariantNumeric: 'lining-nums' }}
        >
          {value}
        </text>
      )}
    </Box>
  );
}

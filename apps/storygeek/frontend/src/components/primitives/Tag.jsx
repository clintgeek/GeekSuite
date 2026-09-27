import { Box, alpha, useTheme } from '@mui/material';
import { fonts } from '../../theme/theme';

/**
 * Tag — a small inked label (status, relationship, "dormant", "secret").
 *
 * Deliberately never a filled chip: the text is the tone's own ink, measured
 * >= 5:1 on every surface in theme.js, over at most an 8% wash of itself —
 * so the 12px label never depends on a fill it would have to clear 4.5:1
 * against.
 */
export default function Tag({ tone = 'neutral', children, sx, ...rest }) {
  const theme = useTheme();
  const ink = theme.palette.candle.tone[tone] || theme.palette.candle.tone.neutral;
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 22,
        px: 1,
        borderRadius: '3px',
        border: `1px solid ${alpha(ink, 0.55)}`,
        backgroundColor: alpha(ink, 0.07),
        color: ink,
        fontFamily: fonts.ui,
        fontWeight: 700,
        fontSize: '0.75rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        lineHeight: 1,
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
}

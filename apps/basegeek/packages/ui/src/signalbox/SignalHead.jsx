import { Box, useTheme } from '@mui/material';

/**
 * The mark: a signal head showing clear. Drawn, not a font glyph, and the same
 * in both modes (it is a lamp on a post, not a surface).
 */
export default function SignalHead({ size = 32 }) {
  const theme = useTheme();
  const { lamp, plate, tape } = theme.palette.box;
  return (
    <Box component="svg" viewBox="0 0 20 32" aria-hidden="true" focusable="false" sx={{ width: size * 0.625, height: size, flexShrink: 0, display: 'block' }}>
      <rect x="0.75" y="0.75" width="18.5" height="30.5" rx="5" fill={tape.black} stroke={plate.face} strokeWidth="1.5" />
      <circle cx="10" cy="10" r="5" fill={theme.palette.mode === 'dark' ? lamp.ok : '#1f9a4d'} />
      <circle cx="10" cy="10" r="2" fill="#c8f5d6" />
      <circle cx="10" cy="22" r="5" fill="#3a1512" />
    </Box>
  );
}

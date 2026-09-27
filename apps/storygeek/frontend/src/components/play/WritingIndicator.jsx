import { Box, Typography, useTheme } from '@mui/material';
import Candle from '../primitives/Candle';
import { fonts } from '../../theme/theme';

/**
 * The "streaming" state. The GM's reply arrives whole (no token stream yet),
 * so this is a waiting mark on the page where the next paragraph will land:
 * a lit candle and a line that says who is writing. `role="status"` makes it
 * a polite live region, announced once.
 */
export default function WritingIndicator() {
  const theme = useTheme();
  const c = theme.palette.candle;
  return (
    <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3, mt: 0.5 }}>
      <Candle size={40} flame={c.mode === 'dark' ? c.accent : '#c98a2e'} wax={c.mode === 'dark' ? '#efe3c8' : '#fffaf0'} />
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontFamily: fonts.text, fontStyle: 'italic', fontSize: '1.0625rem', color: 'text.secondary' }}>
          The Game Master is writing
          <Box component="span" className="sg-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></Box>
        </Typography>
        {/* Ghost lines where the paragraph will land. */}
        <Box aria-hidden="true" sx={{ mt: 1, display: 'grid', gap: 0.75, maxWidth: 420 }}>
          {[92, 100, 64].map((w) => (
            <Box key={w} className="sg-candle-glow" sx={{ height: 6, width: `${w}%`, borderRadius: 3, backgroundColor: c.rule, opacity: 0.8 }} />
          ))}
        </Box>
      </Box>
    </Box>
  );
}

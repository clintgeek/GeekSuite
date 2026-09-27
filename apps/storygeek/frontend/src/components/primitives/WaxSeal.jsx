import { Box, Typography, useTheme } from '@mui/material';
import { fonts } from '../../theme/theme';
import { provenanceOf } from '../../game/provenance';

/**
 * WaxSeal — provenance as a seal pressed into the record: who put this fact
 * in canon, and on which turn.
 *
 * The seal itself is decorative (a wax disc with an initial). The words are
 * a separate small-caps label in the page's own ink — never text on the wax —
 * so the 12px label clears 4.5:1 on every surface without depending on the
 * fill (the chip-contrast trap, MOBILE_UI_PLAN.md).
 */
export function Seal({ source, size = 22 }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  const meta = provenanceOf(source);
  const wax = c.wax[meta.wax];
  const glyph = c.waxGlyph[meta.glyph];
  return (
    <Box component="svg" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
      sx={{ display: 'block', flexShrink: 0, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))' }}>
      {/* A wax blob: a circle with a softly scalloped rim. */}
      <path
        d="M12 1.2c1.3 0 1.9 1 3.1 1.3 1.2.3 2.3-.2 3.2.6.9.8.6 2 1.2 3 .6 1 1.8 1.5 1.9 2.8.1 1.2-.8 1.9-.8 3.1 0 1.2.9 1.9.8 3.1-.1 1.3-1.3 1.8-1.9 2.8-.6 1-.3 2.2-1.2 3-.9.8-2 .3-3.2.6-1.2.3-1.8 1.3-3.1 1.3s-1.9-1-3.1-1.3c-1.2-.3-2.3.2-3.2-.6-.9-.8-.6-2-1.2-3-.6-1-1.8-1.5-1.9-2.8-.1-1.2.8-1.9.8-3.1 0-1.2-.9-1.9-.8-3.1.1-1.3 1.3-1.8 1.9-2.8.6-1 .3-2.2 1.2-3 .9-.8 2-.3 3.2-.6C10.1 2.2 10.7 1.2 12 1.2Z"
        fill={wax}
      />
      <circle cx="12" cy="12" r="6.6" fill="none" stroke={glyph} strokeOpacity="0.45" strokeWidth="0.8" />
      <text x="12" y="15.2" textAnchor="middle" fontSize="9" fontWeight="700" fill={glyph}
        style={{ fontFamily: fonts.display }}>
        {meta.initial}
      </text>
    </Box>
  );
}

/** Seal + "You · T7" label. `turn` may be null. */
export default function WaxSeal({ source, turn, size = 22, sx }) {
  const theme = useTheme();
  const meta = provenanceOf(source);
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexShrink: 0, ...sx }}>
      <Seal source={source} size={size} />
      <Typography component="span" sx={{
        fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.1em',
        textTransform: 'uppercase', color: theme.palette.candle.inkSoft, whiteSpace: 'nowrap',
        fontVariantNumeric: 'lining-nums tabular-nums',
      }}>
        {meta.label}{turn != null ? ` · T${turn}` : ''}
      </Typography>
    </Box>
  );
}

import { Box, Typography, alpha, useTheme } from '@mui/material';
import D20 from '../primitives/D20';
import Tag from '../primitives/Tag';
import { fonts } from '../../theme/theme';
import { diceTone } from '../../game/provenance';

/**
 * DiceRoll — the engine's d20, laid on the page beneath the narration it
 * decided. The number is in the SVG *and* in the text, so it is never only a
 * picture.
 */
export default function DiceRoll({ dice, meta }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  const ink = c.tone[diceTone(dice.result)];
  const isCrit = dice.result === 20 || dice.result === 1;
  const sit = meta?.situation;
  const reason = meta?.reason;

  return (
    <Box sx={{
      mt: 2, px: 1.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5,
      borderRadius: '4px', border: `1px solid ${alpha(ink, 0.35)}`, backgroundColor: alpha(ink, 0.06),
      fontFamily: fonts.ui,
    }}>
      <D20 size={48} value={dice.result} color={ink} fill={alpha(ink, 0.1)} strokeWidth={1.1}
        sx={isCrit ? { filter: `drop-shadow(0 0 6px ${alpha(ink, 0.5)})` } : undefined} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography component="span" sx={{
            fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.8125rem', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: ink, fontVariantNumeric: 'lining-nums',
          }}>
            d20 · {dice.result}{isCrit ? (dice.result === 20 ? ' · Critical' : ' · Fumble') : ''}
          </Typography>
          {sit && <Tag tone={diceTone(dice.result)}>{sit}</Tag>}
        </Box>
        {(dice.interpretation || reason) && (
          <Typography sx={{ fontFamily: fonts.ui, color: 'text.secondary', fontSize: '0.875rem', mt: 0.25, lineHeight: 1.45 }}>
            {dice.interpretation}{reason ? ` — ${reason}` : ''}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

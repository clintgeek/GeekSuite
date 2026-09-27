import { Box, Typography, useTheme } from '@mui/material';
import { fonts } from '../../theme/theme';

/**
 * PanelShell — one rail card: a small-caps heading with a hairline under it,
 * on the table's paper. Shared by the four play panels so the rails read as
 * one set of index cards rather than four hand-rolled boxes.
 */
export function PanelLabel({ children, sx }) {
  const theme = useTheme();
  return (
    <Typography component="h2" sx={{
      fontFamily: fonts.ui, fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.16em',
      textTransform: 'uppercase', color: theme.palette.candle.accentLabel, lineHeight: 1.6,
      fontVariantNumeric: 'lining-nums',
      ...sx,
    }}>
      {children}
    </Typography>
  );
}

export default function PanelShell({ title, children, sx }) {
  const theme = useTheme();
  const c = theme.palette.candle;
  return (
    <Box component="section" sx={{
      p: 3, borderRadius: '6px', bgcolor: c.paper, border: `1px solid ${c.rule}`,
      boxShadow: c.mode === 'dark' ? 'none' : '0 1px 2px rgba(60,35,10,0.08)',
      ...sx,
    }}>
      <PanelLabel sx={{ pb: 1, mb: 2, borderBottom: `1px solid ${c.rule}` }}>{title}</PanelLabel>
      {children}
    </Box>
  );
}

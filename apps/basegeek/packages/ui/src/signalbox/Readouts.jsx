/**
 * Readouts — a bank of labelled readings, as a definition list: the label on a
 * dymo-ish strip, the value in a recessed mono window. Two columns on a phone,
 * as many as fit on a desktop. Values that are missing say "—", not "".
 */
import { Box } from '@mui/material';

export default function Readouts({ items, minWidth = 150 }) {
  return (
    <Box
      component="dl"
      sx={{
        m: 0,
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(auto-fill, minmax(${minWidth}px, 1fr))` },
        gap: 1,
      }}
    >
      {items.map(({ label, value }) => (
        <Box
          key={label}
          sx={{
            minWidth: 0,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'line.panel',
            bgcolor: 'surfaces.elevated',
            px: 1.25,
            py: 0.75,
          }}
        >
          <Box component="dt" sx={{ fontFamily: 'fontFamilyMono', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>
            {label}
          </Box>
          <Box component="dd" sx={{ m: 0, fontFamily: 'fontFamilyMono', fontWeight: 700, fontSize: '0.875rem', color: 'text.primary', overflowWrap: 'anywhere' }}>
            {value === null || value === undefined || value === '' ? '—' : value}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

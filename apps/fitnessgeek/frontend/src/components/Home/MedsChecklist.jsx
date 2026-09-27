import React from 'react';
import { Box, ButtonBase, Typography, Alert } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Check as CheckIcon } from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';

/**
 * "Did you take your meds?" — Simple mode's meds check-in
 * (SIMPLE_AND_FULL_PLAN.md item 6). One big tick per dose, named plainly:
 * "Metformin · Morning". Tapping writes a dose log; tapping again takes it
 * back. Each row is a real checkbox to a screen reader.
 */
export default function MedsChecklist({ items = [], taken = 0, total = 0, onToggle, saving, error, title = 'Did you take your meds?' }) {
  const theme = useTheme();
  const leaf = theme.palette.produce?.lunch || {};

  return (
    <Box component="section" aria-labelledby="meds-checklist-title" data-testid="meds-checklist">
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 1.5 }}>
        <Typography id="meds-checklist-title" component="h2" sx={{ fontSize: '1.375rem', fontWeight: 800 }}>
          {title}
        </Typography>
        {total > 0 && (
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {taken} of {total}
          </Typography>
        )}
      </Box>

      {total === 0 ? (
        <Typography sx={{ color: 'text.secondary', fontSize: '1.0625rem' }}>
          No medicines added yet.{' '}
          <Box component={RouterLink} to="/medications" sx={{ color: 'primary.main', fontWeight: 800 }}>
            Add one
          </Box>
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((item) => (
            <ButtonBase
              key={item.key}
              role="checkbox"
              aria-checked={item.taken}
              aria-busy={saving === item.key}
              aria-label={`${item.name}${item.slotLabel ? `, ${item.slotLabel.toLowerCase()}` : ''}${item.taken ? ', taken' : ''}`}
              onClick={() => onToggle?.(item)}
              data-testid={`med-${item.key}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 2,
                minHeight: 64,
                px: 2,
                borderRadius: '20px',
                textAlign: 'left',
                bgcolor: item.taken ? leaf.tint : theme.palette.background.paper,
                border: `1px solid ${theme.palette.divider}`,
                '@media (hover: hover)': { '&:hover': { bgcolor: item.taken ? leaf.tint : alpha(theme.palette.text.primary, 0.03) } },
                '&:focus-visible': { outline: `3px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: '12px',
                  flexShrink: 0,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: item.taken ? leaf.fill : 'transparent',
                  color: leaf.ink,
                  border: item.taken ? 'none' : `2.5px solid ${theme.palette.text.secondary}`,
                }}
              >
                {item.taken && <CheckIcon sx={{ fontSize: 28 }} />}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontSize: '1.125rem', fontWeight: 800, color: 'text.primary', lineHeight: 1.25 }}>
                  {item.name}
                </Typography>
                {item.slotLabel && (
                  <Typography sx={{ fontSize: '1rem', color: 'text.secondary' }}>{item.slotLabel}</Typography>
                )}
              </Box>
            </ButtonBase>
          ))}
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
    </Box>
  );
}

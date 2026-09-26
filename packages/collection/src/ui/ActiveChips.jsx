/**
 * The active filters as removable chips, with "Clear all" at the end.
 *
 *   Genre RPG ×   Store Steam ×   Released 2010–2020 ×   Clear all
 *
 * The group is a quiet prefix so a row of chips reads as a sentence, not a
 * pile of words. Each painted pill is 32px; the ButtonBase around it is the
 * 44px target. On a phone the row scrolls sideways inside its own strip
 * (the page itself never does); at md+ it wraps.
 */
import React from 'react';
import { Box, ButtonBase } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

export default function ActiveChips({ chips, onRemove, onClearAll, scroll = false }) {
  if (!chips.length) return null;
  return (
    <Box
      component="ul"
      aria-label="Active filters"
      data-testid="active-chips"
      sx={{
        listStyle: 'none',
        m: 0,
        p: 0,
        display: 'flex',
        alignItems: 'center',
        columnGap: 0.75,
        ...(scroll
          ? {
              flexWrap: 'nowrap',
              overflowX: 'auto',
              mx: -2,
              px: 2,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              maskImage: 'linear-gradient(90deg, #000 calc(100% - 24px), transparent)',
            }
          : { flexWrap: 'wrap' }),
      }}
    >
      {chips.map((c) => (
        <Box component="li" key={c.id} sx={{ flex: '0 0 auto', maxWidth: scroll ? 'none' : '100%' }}>
          <ButtonBase
            onClick={() => onRemove(c)}
            aria-label={`Remove ${c.group}: ${c.label}`}
            sx={{ minHeight: 44, borderRadius: '999px', maxWidth: '100%', '&.Mui-focusVisible > span': { outline: 2, outlineStyle: 'solid', outlineColor: 'primary.main', outlineOffset: 1 } }}
          >
            <Box
              component="span"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.625,
                height: 32,
                pl: 1.5,
                pr: 0.75,
                borderRadius: '999px',
                border: 1,
                borderColor: 'border',
                bgcolor: 'background.paper',
                fontSize: '0.8125rem',
                maxWidth: '100%',
                minWidth: 0,
                transition: 'border-color 120ms, background-color 120ms',
                '&:hover': { borderColor: 'text.secondary' },
              }}
            >
              <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                {c.group}
              </Box>
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {c.label}
              </Box>
              <CloseIcon aria-hidden="true" sx={{ fontSize: 16, color: 'text.secondary', flexShrink: 0 }} />
            </Box>
          </ButtonBase>
        </Box>
      ))}
      <Box component="li" sx={{ flex: '0 0 auto' }}>
        <ButtonBase
          onClick={onClearAll}
          sx={{
            minHeight: 44,
            px: 1.25,
            borderRadius: '999px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'text.secondary',
            whiteSpace: 'nowrap',
            textDecoration: 'underline',
            textDecorationColor: 'transparent',
            textUnderlineOffset: '3px',
            transition: 'color 120ms, text-decoration-color 120ms',
            '&:hover': { color: 'text.primary', textDecorationColor: 'currentColor' },
            '&.Mui-focusVisible': { outline: 2, outlineStyle: 'solid', outlineColor: 'primary.main' },
          }}
        >
          Clear all
        </ButtonBase>
      </Box>
    </Box>
  );
}

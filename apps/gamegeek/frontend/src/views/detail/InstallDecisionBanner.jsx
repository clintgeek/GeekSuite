/**
 * "Not installed anymore — how did it end?" — shown on the detail sheet when
 * the Playnite import flagged this Playing game (me.installFlag =
 * 'uninstalled'; apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §Installed → Playing).
 *
 * Calm on purpose: a question, not an alarm. The import never moved the
 * shelf; nothing changes until one of the four answers is picked. Each answer
 * carries its taste-model meaning as a second line and in its accessible
 * name, like the shelf picker.
 */
import React, { useId } from 'react';
import { Box, ButtonBase, Typography, alpha } from '@mui/material';
import { hardShadow } from '../../theme/theme';
import { INSTALL_ANSWERS } from '../../utils/installDecision';

export default function InstallDecisionBanner({ game, onResolve }) {
  const headingId = useId();
  return (
    <Box
      component="section"
      aria-labelledby={headingId}
      data-testid="install-decision"
      sx={{
        // Arcade Sticker, like every section on the sheet (review 2026-11-18 #4).
        border: '2px solid',
        borderColor: 'border',
        borderRadius: '10px',
        bgcolor: 'background.card',
        boxShadow: (t) => hardShadow(3, t.palette.arcade.shadow),
        p: 2,
        minWidth: 0,
      }}
    >
      <Typography id={headingId} component="h3" sx={{ fontSize: '0.9375rem', fontWeight: 700, color: 'text.primary' }}>
        Not installed anymore — how did it end?
      </Typography>
      <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5, lineHeight: 1.5 }}>
        Playnite no longer has {game.title} installed. It stays on Playing until you pick.
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          gap: 1,
          mt: 1.5,
        }}
      >
        {INSTALL_ANSWERS.map((a) => (
          <ButtonBase
            key={a.action}
            onClick={() => onResolve(a.action)}
            aria-label={`${a.label} — ${a.meaning}`}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              textAlign: 'left',
              gap: 0.25,
              minHeight: 44,
              px: 1.25,
              py: 1,
              borderRadius: '8px',
              border: '2px solid',
              fontFamily: 'inherit',
              borderColor: 'border',
              bgcolor: 'background.paper',
              boxShadow: (t) => hardShadow(2, t.palette.arcade.shadow),
              transition: 'background-color 120ms, transform 80ms, box-shadow 80ms',
              '&:hover': { bgcolor: (t) => alpha(t.palette.text.primary, 0.035) },
              '&:active': { transform: 'translate(2px, 2px)', boxShadow: 'none' },
              '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
              '&.Mui-focusVisible': { outline: 2, outlineStyle: 'solid', outlineColor: 'primary.main', outlineOffset: 1 },
            }}
          >
            <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 700, color: 'text.primary' }}>
              {a.label}
            </Box>
            <Box component="span" aria-hidden="true" sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.4 }}>
              {a.meaning}
            </Box>
          </ButtonBase>
        ))}
      </Box>
    </Box>
  );
}

/**
 * One collapsible filter section: a heading that IS a button (aria-expanded,
 * aria-controls), and a body that collapses. The heading carries how many of
 * its values are on, so a closed section still says it is narrowing.
 *
 * `quiet` sections (Metadata, for cleanup) read a step down: secondary ink,
 * no count pill in amber.
 */
import React, { useId } from 'react';
import { Box, ButtonBase, Collapse, Typography, alpha } from '@mui/material';
import { ExpandMore as ExpandIcon } from '@mui/icons-material';
import { DISPLAY_FONT } from '../../theme/theme';
import { visuallyHidden } from '../../utils/a11y';

export default function FacetSection({ id, title, caption, open, onToggle, activeCount = 0, quiet = false, children }) {
  const uid = useId();
  const headId = `facet-${id}-${uid}`;
  const bodyId = `facet-${id}-body-${uid}`;

  return (
    <Box component="section" aria-labelledby={headId} data-facet={id} sx={{ borderTop: 1, borderColor: 'divider', '&:first-of-type': { borderTop: 0 } }}>
      <Typography component="h3" sx={{ m: 0, font: 'inherit' }}>
        <ButtonBase
          id={headId}
          aria-expanded={open ? 'true' : 'false'}
          aria-controls={bodyId}
          onClick={() => onToggle(id)}
          sx={{
            width: '100%',
            minHeight: 44,
            px: 1,
            gap: 1,
            justifyContent: 'flex-start',
            borderRadius: '8px',
            textAlign: 'left',
            '&:hover': { bgcolor: (t) => alpha(t.palette.text.primary, 0.04) },
            '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main', outlineOffset: -2 },
          }}
        >
          <Box
            component="span"
            sx={{
              flex: 1,
              minWidth: 0,
              fontFamily: DISPLAY_FONT,
              fontSize: '0.875rem',
              fontWeight: 600,
              letterSpacing: '-0.005em',
              color: quiet ? 'text.secondary' : 'text.primary',
            }}
          >
            {title}
            {caption ? (
              <Box component="span" sx={{ ml: 0.75, fontFamily: 'inherit', fontWeight: 500, fontSize: '0.75rem', color: 'text.secondary' }}>
                {caption}
              </Box>
            ) : null}
          </Box>
          {activeCount ? (
            <Box
              component="span"
              sx={{
                minWidth: 22,
                height: 20,
                px: 0.75,
                borderRadius: '999px',
                display: 'inline-grid',
                placeItems: 'center',
                fontSize: '0.75rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: 'text.primary',
                bgcolor: (t) => alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.2 : 0.12),
                boxShadow: (t) => `inset 0 0 0 1px ${alpha(t.palette.primary.main, 0.5)}`,
              }}
            >
              {activeCount}
              <Box component="span" sx={visuallyHidden}> selected</Box>
            </Box>
          ) : null}
          <ExpandIcon
            aria-hidden="true"
            sx={{
              fontSize: 20,
              color: 'text.secondary',
              transition: 'transform 160ms ease',
              transform: open ? 'rotate(180deg)' : 'none',
            }}
          />
        </ButtonBase>
      </Typography>
      <Collapse in={open} timeout={160} unmountOnExit>
        <Box id={bodyId} sx={{ pb: 1.5 }}>
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

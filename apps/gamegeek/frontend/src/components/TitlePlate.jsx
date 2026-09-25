/**
 * The cover a game gets when it has no art (utils/titlePlate.js has the why).
 *
 * Built like a game case seen face-on: a slate ground keyed by the title, a
 * faint lit spine down the left edge, a CRT scanline wash, an amber phosphor
 * rule, and the title set in Space Grotesk. The platform sits along the top
 * the way a box's banner does.
 *
 *   variant="card"  the library grid (≈170px wide)
 *   variant="hero"  the detail sheet (≈140–220px wide, bigger type)
 *   variant="thumb" list rows and search results: initials only
 */
import React from 'react';
import { Box } from '@mui/material';
import { DISPLAY_FONT } from '../theme/theme';
import { PLATE_INK, PLATE_SUBINK, plateFor, plateTitleSize } from '../utils/titlePlate';
import { platformShort } from '../utils/vocab';
import PlatformGlyph from './PlatformGlyph';

function initials(title) {
  const words = (title || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const skip = new Set(['the', 'a', 'an', 'of']);
  const picked = words.filter((w) => !skip.has(w.toLowerCase()));
  return (picked.length ? picked : words).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export default function TitlePlate({ title, platform, year, variant = 'card', sx }) {
  const { from, to, angle } = plateFor(title);
  const thumb = variant === 'thumb';
  const hero = variant === 'hero';

  return (
    <Box
      data-testid="title-plate"
      aria-hidden="true"
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        color: PLATE_INK,
        textAlign: 'left',
        background: `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: thumb ? 'center' : 'space-between',
        alignItems: thumb ? 'center' : 'stretch',
        p: thumb ? 0 : hero ? 1.75 : 1.25,
        pl: thumb ? 0 : hero ? 2.5 : 2,
        // Scanlines + a soft top-left light, both pure paint.
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 1px, transparent 3px),' +
            'radial-gradient(120% 80% at 15% 0%, rgba(255,255,255,0.10), transparent 60%)',
          pointerEvents: 'none',
        },
        // The spine.
        '&::after': thumb
          ? undefined
          : {
              content: '""',
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              width: hero ? 10 : 8,
              background: 'linear-gradient(90deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02) 70%, rgba(0,0,0,0.25))',
              borderRight: '1px solid rgba(0,0,0,0.35)',
              pointerEvents: 'none',
            },
        ...sx,
      }}
    >
      {thumb ? (
        <Box
          component="span"
          sx={{ position: 'relative', fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: '0.8125rem', letterSpacing: '0.02em' }}
        >
          {initials(title)}
        </Box>
      ) : (
        <>
          <Box
            sx={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              minHeight: 16,
              color: PLATE_SUBINK,
              fontSize: '0.75rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            {platform ? (
              <>
                <PlatformGlyph platform={platform} sx={{ fontSize: 14 }} />
                <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {platformShort(platform)}
                </Box>
              </>
            ) : null}
          </Box>

          <Box sx={{ position: 'relative' }}>
            <Box sx={{ width: hero ? 32 : 24, height: 3, bgcolor: '#FFB547', mb: hero ? 1.25 : 1, boxShadow: '0 0 10px rgba(255,181,71,0.45)' }} />
            <Box
              sx={{
                fontFamily: DISPLAY_FONT,
                fontWeight: 700,
                fontSize: hero ? `calc(${plateTitleSize(title)} * 1.25)` : plateTitleSize(title),
                lineHeight: 1.08,
                letterSpacing: '-0.015em',
                textWrap: 'balance',
                overflowWrap: 'anywhere',
                display: '-webkit-box',
                WebkitLineClamp: 5,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textShadow: '0 1px 2px rgba(0,0,0,0.35)',
              }}
            >
              {title || 'Untitled'}
            </Box>
            {year ? (
              <Box sx={{ mt: 0.75, fontSize: '0.75rem', fontWeight: 500, color: PLATE_SUBINK, letterSpacing: '0.06em' }}>{year}</Box>
            ) : null}
          </Box>
        </>
      )}
    </Box>
  );
}

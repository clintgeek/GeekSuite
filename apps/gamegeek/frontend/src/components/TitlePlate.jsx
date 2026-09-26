/**
 * The cover a game gets when it has no art (utils/titlePlate.js has the why).
 *
 * Built like an arcade sticker: a flat loud ground keyed by the title, a
 * chunky ink-edged stripe in a second colour across the top, a halftone dot
 * corner, the platform on an ink banner, and the title set big in Bungee,
 * in ink, on the ground. Text never sits on the stripe or the dots.
 *
 *   variant="card"  the library grid (≈170px wide)
 *   variant="hero"  the detail sheet (≈140–220px wide, bigger type)
 *   variant="thumb" list rows and search results: initials only
 */
import React from 'react';
import { Box } from '@mui/material';
import { DISPLAY_FONT, DISPLAY_WEIGHT } from '../theme/theme';
import { PLATE_BANNER, PLATE_INK, plateFor, plateTitleSize } from '../utils/titlePlate';
import { platformShort } from '../utils/vocab';
import PlatformGlyph from './PlatformGlyph';

function initials(title) {
  const words = (title || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const skip = new Set(['the', 'a', 'an', 'of']);
  const picked = words.filter((w) => !skip.has(w.toLowerCase()));
  return (picked.length ? picked : words).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export default function TitlePlate({ title, platform, year, variant = 'card', sx }) {
  const { ground, pop, angle } = plateFor(title);
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
        bgcolor: ground,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: thumb ? 'center' : 'space-between',
        alignItems: thumb ? 'center' : 'stretch',
        // The stripe: a fat band of the pop colour with ink edges, laid
        // across the upper third at the plate's own angle.
        '&::before': thumb
          ? undefined
          : {
              content: '""',
              position: 'absolute',
              left: '-20%',
              right: '-20%',
              top: hero ? '24%' : '22%',
              height: hero ? '17%' : '16%',
              bgcolor: pop,
              borderTop: `3px solid ${PLATE_INK}`,
              borderBottom: `3px solid ${PLATE_INK}`,
              transform: `rotate(${angle}deg)`,
              pointerEvents: 'none',
            },
        // Halftone dots in the top-right corner, fading out.
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          right: 0,
          width: thumb ? '100%' : '60%',
          height: thumb ? '100%' : '45%',
          backgroundImage: `radial-gradient(${PLATE_INK} 1.2px, transparent 1.6px)`,
          backgroundSize: thumb ? '5px 5px' : '7px 7px',
          opacity: 0.22,
          maskImage: 'radial-gradient(circle at 100% 0%, #000 20%, transparent 75%)',
          pointerEvents: 'none',
        },
        ...sx,
      }}
    >
      {thumb ? (
        <Box
          component="span"
          sx={{ position: 'relative', zIndex: 1, fontFamily: DISPLAY_FONT, fontWeight: DISPLAY_WEIGHT, fontSize: '0.8125rem', lineHeight: 1 }}
        >
          {initials(title)}
        </Box>
      ) : (
        <>
          <Box sx={{ position: 'relative', zIndex: 1, p: hero ? 1.25 : 1 }}>
            {platform ? (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  maxWidth: '100%',
                  minHeight: 20,
                  px: 0.75,
                  borderRadius: '4px',
                  bgcolor: PLATE_BANNER.bg,
                  color: PLATE_BANNER.fg,
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  lineHeight: 1,
                }}
              >
                <PlatformGlyph platform={platform} sx={{ fontSize: 14 }} />
                <Box component="span" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {platformShort(platform)}
                </Box>
              </Box>
            ) : null}
          </Box>

          {/* The title block owns a solid ground so it can rise over the
              stripe on a long name and still be ink on one flat colour. */}
          <Box sx={{ position: 'relative', zIndex: 1, bgcolor: ground, px: hero ? 1.5 : 1.125, pt: 0.75, pb: hero ? 1.5 : 1.125 }}>
            <Box
              sx={{
                fontFamily: DISPLAY_FONT,
                fontWeight: DISPLAY_WEIGHT,
                fontSize: hero ? `calc(${plateTitleSize(title)} * 1.2)` : plateTitleSize(title),
                lineHeight: 1.02,
                textTransform: 'uppercase',
                overflowWrap: 'anywhere',
                display: '-webkit-box',
                WebkitLineClamp: 5,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {title || 'Untitled'}
            </Box>
            {year ? (
              <Box sx={{ mt: 0.625, fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}>{year}</Box>
            ) : null}
          </Box>
        </>
      )}
    </Box>
  );
}

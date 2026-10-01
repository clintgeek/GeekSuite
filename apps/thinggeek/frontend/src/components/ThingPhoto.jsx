/**
 * A thing's picture: its cover thumbnail, or — before anyone has taken one —
 * its BOX (Moving Day): the cardboard face of a moving box with a hand-hold,
 * the printed orange band and the type's glyph; on a card the band carries
 * the box's stencilled size and any FRAGILE stamp (utils/boxMarks.js). A
 * photo that fails to load falls back to the box rather than a broken image.
 *
 * Decorative (`alt=""`, the box aria-hidden): the card or row around it
 * carries the name.
 */
import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import TypeIcon from './TypeIcon';
import { LIVERY, STENCIL_FONT, dustImage } from '../theme/theme';

const RATIOS = { card: '4 / 3', thumb: '1 / 1', hero: '4 / 3' };

/**
 * The box face. `marks` ({ size, care }) prints the stencil on the band —
 * only where there's room for it (`compact` false).
 */
export function TypePlate({ icon, iconSize = '38%', marks = null, compact = false, sx }) {
  return (
    <Box
      aria-hidden="true"
      data-testid="box-face"
      data-size={marks?.size ?? ''}
      sx={{
        position: 'absolute',
        inset: 0,
        bgcolor: 'box.face',
        backgroundImage: (t) => `${dustImage(t.palette.mode)}, linear-gradient(90deg, rgba(0,0,0,0.06), transparent 18%, transparent 82%, rgba(0,0,0,0.08))`,
        color: 'box.print',
        overflow: 'hidden',
        ...sx,
      }}
    >
      {/* the hand-hold */}
      <Box sx={{ position: 'absolute', left: '50%', top: compact ? '14%' : '12%', width: compact ? '34%' : '22%', height: compact ? '10%' : '9%', transform: 'translateX(-50%)', borderRadius: '999px', bgcolor: 'box.hole' }} />
      {/* packing tape down from the top */}
      <Box sx={{ position: 'absolute', left: '50%', top: 0, width: compact ? '14%' : '9%', height: compact ? '10%' : '10%', transform: 'translateX(-50%)', bgcolor: 'rgba(255, 244, 222, 0.45)' }} />
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pb: compact ? '18%' : '16%' }}>
        <TypeIcon name={icon} sx={{ width: iconSize, height: iconSize, maxWidth: 64, maxHeight: 64, opacity: 0.8 }} />
      </Box>
      {/* the printed band, with the size stencilled on it */}
      <Box
        data-caption={!compact && marks?.size ? marks.size : ''}
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: compact ? '14%' : '12%',
          height: compact ? '16%' : '20%',
          bgcolor: LIVERY.orange,
          color: LIVERY.ink,
          display: 'grid',
          placeItems: 'center',
          '&::before': { content: 'attr(data-caption)', fontFamily: STENCIL_FONT, fontSize: '0.8125rem', letterSpacing: '0.12em', lineHeight: 1 },
        }}
      />
      {!compact && marks?.care ? (
        <Box
          data-caption={marks.care}
          sx={{
            position: 'absolute',
            right: '6%',
            top: '24%',
            transform: 'rotate(-6deg)',
            px: '5px',
            py: '2px',
            border: '1.5px solid',
            borderColor: 'status.overdue',
            color: 'status.overdue',
            '&::before': { content: 'attr(data-caption)', fontFamily: STENCIL_FONT, fontSize: '0.75rem', letterSpacing: '0.06em', lineHeight: 1 },
          }}
        />
      ) : null}
    </Box>
  );
}

export default function ThingPhoto({ src, icon, variant = 'card', radius = 4, marks = null, children, sx, iconSize }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImage = src && !failed;
  return (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: RATIOS[variant] ?? RATIOS.card,
        borderRadius: `${radius}px`,
        overflow: 'hidden',
        bgcolor: 'background.raised',
        flexShrink: 0,
        ...sx,
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <TypePlate icon={icon} marks={marks} compact={variant === 'thumb'} iconSize={iconSize ?? (variant === 'thumb' ? '44%' : '30%')} />
      )}
      {children}
    </Box>
  );
}

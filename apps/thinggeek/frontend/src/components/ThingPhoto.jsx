/**
 * A thing's picture: its cover thumbnail, or — before anyone has taken one —
 * its BIN (Storage Yard): the cardboard front of a storage bin with a
 * hand-hold, a slim orange stripe and the type's glyph. No size or care
 * markings. A photo that fails to load falls back to the bin rather than a
 * broken image.
 *
 * Decorative (`alt=""`, the bin aria-hidden): the card or row around it
 * carries the name.
 */
import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import TypeIcon from './TypeIcon';
import { LIVERY, dustImage } from '../theme/theme';

const RATIOS = { card: '4 / 3', thumb: '1 / 1', hero: '4 / 3' };

/** The bin face: kraft, a hand-hold, the glyph, a slim orange stripe. */
export function TypePlate({ icon, iconSize = '38%', compact = false, sx }) {
  return (
    <Box
      aria-hidden="true"
      data-testid="bin-face"
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
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pb: compact ? '8%' : '10%', pt: compact ? '10%' : '6%' }}>
        <TypeIcon name={icon} sx={{ width: iconSize, height: iconSize, maxWidth: 64, maxHeight: 64, opacity: 0.8 }} />
      </Box>
      {/* the stripe along the foot */}
      <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: compact ? '10%' : '9%', height: compact ? '8%' : '7%', bgcolor: LIVERY.orange }} />
    </Box>
  );
}

export default function ThingPhoto({ src, icon, variant = 'card', radius = 4, children, sx, iconSize }) {
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
        <TypePlate icon={icon} compact={variant === 'thumb'} iconSize={iconSize ?? (variant === 'thumb' ? '44%' : '30%')} />
      )}
      {children}
    </Box>
  );
}

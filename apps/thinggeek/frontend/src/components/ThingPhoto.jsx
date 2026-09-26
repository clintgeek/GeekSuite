/**
 * A thing's picture: its cover thumbnail, or — before anyone has taken one —
 * a "type plate": the type's glyph on a quiet green-ruled ground, like a
 * blank ledger card waiting to be filled in. A photo that fails to load falls
 * back to the plate rather than a broken-image box.
 *
 * Decorative (`alt=""`): the card or row around it carries the name.
 */
import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import TypeIcon from './TypeIcon';

const RATIOS = { card: '4 / 3', thumb: '1 / 1', hero: '4 / 3' };

export function TypePlate({ icon, iconSize = '38%', sx }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'plate.ground',
        backgroundImage: (t) => `repeating-linear-gradient(180deg, transparent 0, transparent 13px, ${t.palette.plate.rule} 13px, ${t.palette.plate.rule} 14px)`,
        color: 'plate.icon',
        ...sx,
      }}
    >
      <TypeIcon name={icon} sx={{ width: iconSize, height: iconSize, maxWidth: 72, maxHeight: 72, opacity: 0.9 }} />
    </Box>
  );
}

export default function ThingPhoto({ src, icon, variant = 'card', radius = 8, children, sx, iconSize }) {
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
        <TypePlate icon={icon} iconSize={iconSize ?? (variant === 'thumb' ? '52%' : '34%')} />
      )}
      {children}
    </Box>
  );
}

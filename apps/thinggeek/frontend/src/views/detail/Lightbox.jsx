/**
 * Full-screen photo viewer: ← / → (keys and buttons), Escape closes, the
 * role and caption under the photo. Always dark, whatever the app mode — a
 * photo reads best on black — so it owns its inks.
 */
import React, { useEffect } from 'react';
import { Box, Dialog, IconButton, Typography } from '@mui/material';
import { ChevronLeft as PrevIcon, ChevronRight as NextIcon, Close as CloseIcon } from '@mui/icons-material';
import { photoRoleLabel } from '../../utils/vocab';

export const LIGHTBOX_INK = '#F5F1E8';
export const LIGHTBOX_MUTED = '#C9C2B4';
const GROUND = '#0B0A08';

const buttonSx = { color: LIGHTBOX_INK, bgcolor: 'rgba(255,255,255,0.08)', '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' }, '&.Mui-disabled': { color: 'rgba(245,241,232,0.3)' } };

export default function Lightbox({ photos = [], index, onIndex, onClose, thingName }) {
  const open = index !== null && index !== undefined && photos[index];
  const photo = open ? photos[index] : null;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, photos.length, onIndex]);

  return (
    <Dialog
      open={Boolean(open)}
      onClose={onClose}
      fullScreen
      aria-label={photo ? `${thingName} — photo ${index + 1} of ${photos.length}` : 'Photo'}
      PaperProps={{ sx: { bgcolor: GROUND, backgroundImage: 'none', borderRadius: 0 } }}
    >
      {photo ? (
        <Box sx={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }} data-testid="lightbox">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 'calc(8px + env(safe-area-inset-top))', pb: 1 }}>
            <Typography sx={{ flex: 1, minWidth: 0, color: LIGHTBOX_INK, fontWeight: 700, fontSize: '0.9375rem' }} noWrap>
              {thingName}
            </Typography>
            <Typography sx={{ color: LIGHTBOX_MUTED, fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
              {index + 1} / {photos.length}
            </Typography>
            <IconButton onClick={onClose} aria-label="Close photo" sx={buttonSx}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', px: { xs: 0, md: 9 } }}>
            <Box component="img" src={photo.url} alt={photo.caption || `${thingName} — ${photoRoleLabel(photo.role)}`} sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
            <IconButton onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous photo" sx={{ ...buttonSx, position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <PrevIcon />
            </IconButton>
            <IconButton onClick={() => onIndex(index + 1)} disabled={index >= photos.length - 1} aria-label="Next photo" sx={{ ...buttonSx, position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
              <NextIcon />
            </IconButton>
          </Box>
          <Box sx={{ px: 2, pt: 1.5, pb: 'calc(16px + env(safe-area-inset-bottom))', textAlign: 'center' }}>
            <Typography sx={{ color: LIGHTBOX_INK, fontWeight: 700, fontSize: '0.875rem' }}>{photoRoleLabel(photo.role)}</Typography>
            {photo.caption ? <Typography sx={{ color: LIGHTBOX_MUTED, fontSize: '0.875rem', mt: 0.25 }}>{photo.caption}</Typography> : null}
          </Box>
        </Box>
      ) : null}
    </Dialog>
  );
}

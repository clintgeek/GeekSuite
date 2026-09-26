/**
 * The photo gallery at the top of a thing's page.
 *
 *   - One photo per slide on a scroll-snapping track: a native swipe on a
 *     phone, arrow buttons at md+. Each photo sits `contain`ed over a blurred
 *     copy of itself, so an ID-plate close-up and a whole boat both read
 *     without cropping.
 *   - A role badge on every slide (Overview, ID plate, Receipt…).
 *   - Tap a photo to open the lightbox (arrow keys, Escape).
 *   - Photos still uploading show their local preview under a progress bar;
 *     a failed one offers Retry right there.
 *   - No photos yet: the type plate with a "Take the first photo" action.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, ButtonBase, IconButton, LinearProgress, Typography } from '@mui/material';
import { AddAPhotoOutlined as AddPhotoIcon, PhotoOutlined as PhotoIcon, ChevronLeft as PrevIcon, ChevronRight as NextIcon, ErrorOutline as FailedIcon } from '@mui/icons-material';
import { TypePlate } from '../../components/ThingPhoto';
import { photoRoleLabel } from '../../utils/vocab';
import Lightbox from './Lightbox';

export const OVERLAY_INK = '#FFFFFF';
export const OVERLAY_GROUND = 'rgba(17, 16, 13, 0.78)';

export function RoleBadge({ role, sx }) {
  return (
    <Box
      component="span"
      data-testid="role-badge"
      sx={{
        position: 'absolute',
        left: 10,
        bottom: 10,
        px: 1,
        py: '3px',
        borderRadius: '6px',
        bgcolor: OVERLAY_GROUND,
        color: OVERLAY_INK,
        fontSize: '0.75rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        backdropFilter: 'blur(4px)',
        ...sx,
      }}
    >
      {photoRoleLabel(role)}
    </Box>
  );
}

/**
 * A photo the browser can't draw (HEIC is stored as-is where sharp can't
 * convert it, with no thumbnail) shows a plain tile rather than a broken image.
 */
function Unpreviewable({ url }) {
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', px: 3, color: OVERLAY_INK }}>
      <Box>
        <PhotoIcon aria-hidden="true" sx={{ fontSize: 40, opacity: 0.8 }} />
        <Typography sx={{ color: OVERLAY_INK, fontSize: '0.875rem', mt: 1 }}>This photo can't be previewed here.</Typography>
        {url ? (
          <Button component="a" href={url} download size="small" sx={{ color: OVERLAY_INK, textDecoration: 'underline', mt: 0.5 }}>
            Download the original
          </Button>
        ) : null}
      </Box>
    </Box>
  );
}

function Slide({ src, alt, onOpen, children, label }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const fail = () => setFailed(true);
  return (
    <Box sx={{ position: 'relative', flex: '0 0 100%', scrollSnapAlign: 'center', height: '100%', overflow: 'hidden', bgcolor: '#11100D' }}>
      {src && failed ? <Unpreviewable url={src} /> : null}
      {src && !failed ? (
        <>
          <Box component="img" src={src} alt="" aria-hidden="true" sx={{ position: 'absolute', inset: '-10%', width: '120%', height: '120%', objectFit: 'cover', filter: 'blur(26px) saturate(1.1)', opacity: 0.55 }} />
          {onOpen ? (
            <ButtonBase onClick={onOpen} aria-label={label} sx={{ position: 'absolute', inset: 0, display: 'block' }}>
              <Box component="img" src={src} alt={alt} onError={fail} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', position: 'relative' }} />
            </ButtonBase>
          ) : (
            <Box component="img" src={src} alt={alt} onError={fail} sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
          )}
        </>
      ) : null}
      {children}
    </Box>
  );
}

export default function Gallery({ thing, uploads = [], onAddPhoto, onRetry }) {
  const photos = thing.photos ?? [];
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const count = photos.length + uploads.length;

  useEffect(() => setIndex(0), [thing.id]);

  const onScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  const go = (next) => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.max(0, Math.min(count - 1, next));
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    setIndex(i);
  };

  if (!count) {
    return (
      <Box sx={{ position: 'relative', height: { xs: 200, md: 240 }, overflow: 'hidden' }}>
        <TypePlate icon={thing.type?.icon} iconSize="64px" />
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'end center', pb: 2.5 }}>
          <Button variant="contained" startIcon={<AddPhotoIcon />} onClick={onAddPhoto} sx={{ boxShadow: '0 6px 18px rgba(0,0,0,0.18)' }}>
            Take the first photo
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', height: { xs: 260, sm: 320, md: 360 } }} data-testid="gallery">
      <Box
        ref={trackRef}
        onScroll={onScroll}
        tabIndex={-1}
        sx={{
          display: 'flex',
          height: '100%',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {photos.map((p, i) => (
          <Slide
            key={p.id}
            src={p.url}
            alt={p.caption || `${thing.name} — ${photoRoleLabel(p.role)}`}
            label={`Open photo ${i + 1} of ${count}: ${photoRoleLabel(p.role)}${p.caption ? `, ${p.caption}` : ''}`}
            onOpen={() => setLightbox(i)}
          >
            <RoleBadge role={p.role} />
          </Slide>
        ))}
        {uploads.map((u) => (
          <Slide key={u.key} src={u.previewUrl} alt={`${photoRoleLabel(u.role)} photo, uploading`}>
            <RoleBadge role={u.role} />
            <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, p: 1.5, pt: 4, background: `linear-gradient(transparent, ${OVERLAY_GROUND})` }}>
              {u.status === 'failed' ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                  <FailedIcon sx={{ color: OVERLAY_INK, fontSize: 18 }} aria-hidden="true" />
                  <Typography sx={{ color: OVERLAY_INK, fontSize: '0.8125rem', fontWeight: 600, mr: 'auto', ml: 11 }}>{u.error}</Typography>
                  <Button size="small" variant="contained" onClick={() => onRetry(u.key)}>
                    Retry
                  </Button>
                </Box>
              ) : (
                <Box sx={{ ml: 11 }}>
                  <Typography sx={{ color: OVERLAY_INK, fontSize: '0.75rem', fontWeight: 700, mb: 0.5 }} aria-live="polite">
                    Uploading… {Math.round((u.progress || 0) * 100)}%
                  </Typography>
                  <LinearProgress variant="determinate" value={Math.round((u.progress || 0) * 100)} aria-label="Upload progress" sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.25)' }} />
                </Box>
              )}
            </Box>
          </Slide>
        ))}
      </Box>

      {count > 1 ? (
        <>
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <IconButton onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous photo" sx={arrowSx('left')}>
              <PrevIcon />
            </IconButton>
            <IconButton onClick={() => go(index + 1)} disabled={index >= count - 1} aria-label="Next photo" sx={arrowSx('right')}>
              <NextIcon />
            </IconButton>
          </Box>
          <Box
            aria-hidden="true"
            sx={{ position: 'absolute', right: 10, bottom: 10, px: 1, py: '3px', borderRadius: '6px', bgcolor: OVERLAY_GROUND, color: OVERLAY_INK, fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.min(index + 1, count)} / {count}
          </Box>
        </>
      ) : null}

      <Lightbox photos={photos} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} thingName={thing.name} />
    </Box>
  );
}

function arrowSx(side) {
  return {
    position: 'absolute',
    top: '50%',
    [side]: 12,
    transform: 'translateY(-50%)',
    bgcolor: OVERLAY_GROUND,
    color: OVERLAY_INK,
    '&:hover': { bgcolor: 'rgba(17, 16, 13, 0.92)' },
    '&.Mui-disabled': { opacity: 0, pointerEvents: 'none' },
  };
}

/**
 * The full-screen media viewer: one item at a time, "3 of 12", swipe or the
 * arrow keys (or the arrow buttons) to move, the close button / Escape /
 * Android back to leave.
 *
 * Trailers: a Steam trailer plays inline in a <video> with its poster — no
 * autoplay; you tap play. Steam now ships HLS only, so a browser that can't
 * play HLS natively gets the poster and a "Watch on Steam" link instead.
 * IGDB trailers are YouTube videos and open in YouTube (no iframe embed).
 *
 * Always dark, whatever the theme: pictures read best on ink.
 */
import React, { useCallback, useRef } from 'react';
import { Box, Button, Dialog, IconButton, Typography } from '@mui/material';
import {
  ChevronLeftRounded as PrevIcon,
  ChevronRightRounded as NextIcon,
  CloseRounded as CloseIcon,
  OpenInNew as ExternalIcon,
  PlayArrowRounded as PlayIcon,
} from '@mui/icons-material';
import { useReducedMotion } from '@geeksuite/ui';
import { useBackToClose } from '../../hooks/useBackToClose';
import { ARCADE, hardShadow } from '../../theme/theme';
import { inlineVideoSource } from '../../utils/gameMedia';

const SWIPE_PX = 48;

const navButtonSx = {
  width: 48,
  height: 48,
  color: ARCADE.paperInk,
  bgcolor: 'rgba(12,10,18,0.72)',
  border: `2px solid ${ARCADE.paperInk}`,
  '&:hover': { bgcolor: 'rgba(12,10,18,0.9)' },
  '&.Mui-disabled': { opacity: 0.35, color: ARCADE.paperInk, borderColor: ARCADE.paperInk },
  '&.Mui-focusVisible': { outline: `3px solid ${ARCADE.lime}`, outlineOffset: 2 },
};

function Stage({ item }) {
  if (item.type === 'screenshot') {
    return (
      <Box
        component="img"
        src={item.full}
        alt={item.label}
        data-testid="viewer-image"
        sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block', userSelect: 'none' }}
        draggable={false}
      />
    );
  }

  const inline = inlineVideoSource(item);
  if (inline) {
    return (
      <Box
        component="video"
        key={inline.src}
        controls
        playsInline
        preload="none"
        poster={item.thumb || undefined}
        aria-label={item.label}
        data-testid="viewer-video"
        sx={{ maxWidth: '100%', maxHeight: '100%', width: '100%', display: 'block', bgcolor: '#000' }}
      >
        <source src={inline.src} type={inline.type} />
      </Box>
    );
  }

  const where = item.kind === 'youtube' ? 'YouTube' : 'Steam';
  return (
    <Box sx={{ position: 'relative', display: 'grid', placeItems: 'center', maxWidth: '100%', maxHeight: '100%' }}>
      {item.thumb ? (
        <Box component="img" src={item.thumb} alt="" sx={{ maxWidth: '100%', maxHeight: '70vh', width: 'min(100%, 960px)', objectFit: 'contain', display: 'block', opacity: 0.6 }} />
      ) : null}
      <Button
        component="a"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="viewer-watch-out"
        startIcon={<PlayIcon />}
        endIcon={<ExternalIcon sx={{ fontSize: 16 }} aria-hidden="true" />}
        sx={{
          position: item.thumb ? 'absolute' : 'static',
          minHeight: 48,
          px: 2.5,
          bgcolor: ARCADE.lime,
          color: ARCADE.ink,
          border: `2px solid ${ARCADE.ink}`,
          boxShadow: hardShadow(3, ARCADE.ink),
          fontWeight: 700,
          '&:hover': { bgcolor: ARCADE.lime },
        }}
      >
        Watch on {where}
      </Button>
    </Box>
  );
}

export default function MediaViewer({ open, items, index, onIndexChange, onClose }) {
  const reduced = useReducedMotion();
  const touch = useRef(null);
  useBackToClose(open, onClose);

  const count = items.length;
  const safe = Math.min(Math.max(index, 0), Math.max(count - 1, 0));
  const item = items[safe];

  const go = useCallback(
    (delta) => {
      const next = safe + delta;
      if (next >= 0 && next < count) onIndexChange(next);
    },
    [safe, count, onIndexChange],
  );

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(-1);
    }
  };

  const onTouchStart = (e) => {
    const t = e.touches?.[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches?.[0];
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  if (!item) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen
      transitionDuration={reduced ? 0 : undefined}
      aria-label="Media viewer"
      onKeyDown={onKeyDown}
      PaperProps={{ sx: { bgcolor: ARCADE.ink, color: ARCADE.paperInk, backgroundImage: 'none', borderRadius: 0, border: 'none' }, 'data-testid': 'media-viewer' }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 1.5,
          pt: 'calc(8px + env(safe-area-inset-top))',
          pb: 1,
        }}
      >
        <IconButton onClick={onClose} aria-label="Close" sx={navButtonSx}>
          <CloseIcon />
        </IconButton>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography aria-live="polite" data-testid="viewer-index" sx={{ fontWeight: 700, fontSize: '0.9375rem', color: ARCADE.paperInk }}>
            {safe + 1} of {count}
          </Typography>
          <Typography noWrap sx={{ fontSize: '0.8125rem', color: '#C9C0DD' }}>
            {item.type === 'video' ? item.title || 'Trailer' : item.label}
          </Typography>
        </Box>
      </Box>

      <Box
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        sx={{ position: 'relative', flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', px: { xs: 0, md: 9 }, pb: 'calc(72px + env(safe-area-inset-bottom))', touchAction: 'pan-y' }}
      >
        <Stage key={safe} item={item} />
      </Box>

      <Box
        sx={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2,
          pb: 'calc(12px + env(safe-area-inset-bottom))',
          pointerEvents: 'none',
          '& > *': { pointerEvents: 'auto' },
          // At md+ the arrows sit at the sides, vertically centred on the picture.
          top: { md: 0 },
          pt: { md: 9 },
        }}
      >
        <IconButton onClick={() => go(-1)} disabled={safe === 0} aria-label="Previous" sx={navButtonSx}>
          <PrevIcon />
        </IconButton>
        <IconButton onClick={() => go(1)} disabled={safe >= count - 1} aria-label="Next" sx={navButtonSx}>
          <NextIcon />
        </IconButton>
      </Box>
    </Dialog>
  );
}

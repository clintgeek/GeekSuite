/**
 * Capturing a card side or a page on the phone:
 *
 *   CaptureSlot   one slot ("Front", "Back", "Photo page", "Page"): Take a
 *                 photo (the camera, `<input capture>`) or Choose a file
 *                 (a PDF or an image already on the phone); shows what's in it.
 *   CropSheet     after a photo: rotate a quarter-turn at a time and frame it —
 *                 "Card" (the ID-1 shape, 85.6 × 54 mm: drag to move, slider
 *                 to zoom) or "Whole photo". The result is drawn on a canvas
 *                 and re-encoded as a JPEG, which also drops the photo's
 *                 metadata (the GPS of the kitchen table) before upload.
 *
 * Nothing is uploaded from here: the caller gets a Blob/File and sends it to
 * the Attic, which seals it before it touches the disk.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, ButtonBase, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { CameraAltOutlined as CameraIcon, DeleteOutline as RemoveIcon, FolderOpenOutlined as FileIcon, PictureAsPdfOutlined as PdfIcon, RotateLeft, RotateRight } from '@mui/icons-material';
import { GeekSheet } from '@geeksuite/ui';
import { HERO_BUTTON_SX } from './AtticLock';

export const CARD_ASPECT = 85.6 / 54;
const OUT_WIDTH = 1600;
const WHOLE_MAX = 2400;

/** Rotated image dims. */
const turned = (w, h, quarter) => (quarter % 2 ? [h, w] : [w, h]);

/** Draw `img` rotated by `quarter`·90° and framed as the preview shows it → a JPEG Blob. */
export function renderCrop({ img, quarter, mode, zoom, dx, dy, frameW, frameH }) {
  const [rw, rh] = turned(img.naturalWidth, img.naturalHeight, quarter);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (mode === 'whole') {
    const k = Math.min(1, WHOLE_MAX / Math.max(rw, rh));
    canvas.width = Math.round(rw * k);
    canvas.height = Math.round(rh * k);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((quarter * Math.PI) / 2);
    ctx.scale(k, k);
  } else {
    canvas.width = OUT_WIDTH;
    canvas.height = Math.round(OUT_WIDTH / CARD_ASPECT);
    const k = canvas.width / frameW;
    const s0 = Math.max(frameW / rw, frameH / rh);
    ctx.translate(canvas.width / 2 + dx * k, canvas.height / 2 + dy * k);
    ctx.rotate((quarter * Math.PI) / 2);
    ctx.scale(s0 * zoom * k, s0 * zoom * k);
  }
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9));
}

export function CropSheet({ open, file, onCancel, onDone, defaultMode = 'card' }) {
  const [img, setImg] = useState(null);
  const [quarter, setQuarter] = useState(0);
  const [mode, setMode] = useState(defaultMode);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ dx: 0, dy: 0 });
  const [frameW, setFrameW] = useState(320);
  const [busy, setBusy] = useState(false);
  const frameRef = useRef(null);
  const drag = useRef(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    setQuarter(0);
    setZoom(1);
    setOff({ dx: 0, dy: 0 });
    setMode(defaultMode);
    if (!url) return undefined;
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [url, defaultMode]);

  useEffect(() => {
    if (!open) return undefined;
    const measure = () => frameRef.current && setFrameW(frameRef.current.clientWidth || 320);
    const id = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', measure);
    };
  }, [open, img, mode]);

  const [rw, rh] = img ? turned(img.naturalWidth, img.naturalHeight, quarter) : [4, 3];
  const frameH = mode === 'card' ? frameW / CARD_ASPECT : (frameW * rh) / rw;
  const s0 = mode === 'card' ? Math.max(frameW / rw, frameH / rh) : frameW / rw;
  const scale = s0 * (mode === 'card' ? zoom : 1);
  const maxDx = Math.max(0, (rw * scale - frameW) / 2);
  const maxDy = Math.max(0, (rh * scale - frameH) / 2);
  const clamp = (v, m) => Math.max(-m, Math.min(m, v));
  const dx = mode === 'card' ? clamp(off.dx, maxDx) : 0;
  const dy = mode === 'card' ? clamp(off.dy, maxDy) : 0;

  const onPointerDown = (e) => {
    if (mode !== 'card') return;
    drag.current = { x: e.clientX, y: e.clientY, dx, dy };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setOff({ dx: drag.current.dx + e.clientX - drag.current.x, dy: drag.current.dy + e.clientY - drag.current.y });
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (e) => {
    const step = 12;
    const map = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (mode === 'card' && map[e.key]) {
      e.preventDefault();
      setOff({ dx: dx + map[e.key][0], dy: dy + map[e.key][1] });
    }
  };

  const done = async () => {
    if (!img) return;
    setBusy(true);
    try {
      const blob = await renderCrop({ img, quarter, mode, zoom, dx, dy, frameW, frameH });
      if (blob) onDone(new File([blob], 'attic.jpg', { type: 'image/jpeg' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GeekSheet
      open={open}
      onClose={onCancel}
      title="Frame it"
      description="Drag the photo so the card fills the frame. Rotate if it came out sideways."
      actions={
        <>
          <Button onClick={onCancel} sx={{ minHeight: 44, color: 'text.primary' }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={done} disabled={!img || busy} sx={HERO_BUTTON_SX}>
            Use this
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'grid', gap: 1.5, pt: 1 }}>
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_e, v) => v && setMode(v)} aria-label="Framing">
          <ToggleButton value="card" sx={{ minHeight: 44, flex: 1, color: 'text.primary', fontWeight: 700 }}>
            Card
          </ToggleButton>
          <ToggleButton value="whole" sx={{ minHeight: 44, flex: 1, color: 'text.primary', fontWeight: 700 }}>
            Whole photo
          </ToggleButton>
        </ToggleButtonGroup>
        <Box
          ref={frameRef}
          role="img"
          aria-label={mode === 'card' ? 'The card frame. Drag, or use the arrow keys, to move the photo.' : 'The whole photo'}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          data-testid="crop-frame"
          sx={{
            position: 'relative',
            width: '100%',
            height: frameH,
            maxHeight: '60vh',
            overflow: 'hidden',
            borderRadius: mode === 'card' ? '12px' : '2px',
            bgcolor: '#111',
            border: '3px solid',
            borderColor: 'hero.main',
            touchAction: 'none',
            cursor: mode === 'card' ? 'grab' : 'default',
            '&:focus-visible': { outline: '3px solid', outlineColor: 'text.primary', outlineOffset: 2 },
          }}
        >
          {url ? (
            <Box
              component="img"
              src={url}
              alt=""
              draggable={false}
              sx={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: img ? img.naturalWidth : 'auto',
                height: img ? img.naturalHeight : 'auto',
                maxWidth: 'none',
                transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px) rotate(${quarter * 90}deg) scale(${scale})`,
                transformOrigin: 'center',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          ) : null}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button onClick={() => setQuarter((q) => (q + 3) % 4)} startIcon={<RotateLeft />} sx={{ minHeight: 44, color: 'text.primary' }}>
            Left
          </Button>
          <Button onClick={() => setQuarter((q) => (q + 1) % 4)} startIcon={<RotateRight />} sx={{ minHeight: 44, color: 'text.primary' }}>
            Right
          </Button>
          {mode === 'card' ? (
            <Box sx={{ flex: 1, px: 1 }}>
              <Slider value={zoom} min={1} max={3} step={0.05} onChange={(_e, v) => setZoom(v)} aria-label="Zoom" sx={{ color: 'text.primary' }} />
            </Box>
          ) : null}
        </Box>
      </Box>
    </GeekSheet>
  );
}

/**
 * One capture slot. `value` is a File (pending) or null; `onChange(file|null)`.
 * Card-shaped slots open the crop on a photo; a PDF goes as it is.
 */
export function CaptureSlot({ label, value, onChange, card = true, testId }) {
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const [pending, setPending] = useState(null);
  const preview = useMemo(() => (value && value.type?.startsWith('image/') ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const take = (file) => {
    if (!file) return;
    if (file.type === 'application/pdf' || !file.type?.startsWith('image/')) onChange(file);
    else setPending(file);
  };

  return (
    <Box data-testid={testId} data-filled={value ? 'true' : 'false'} sx={{ border: '2px dashed', borderColor: value ? 'transparent' : 'border', borderRadius: '8px', bgcolor: 'background.paper', p: 1.25, display: 'grid', gap: 1 }}>
      <Typography component="p" sx={{ fontWeight: 800, fontSize: '0.9375rem' }}>
        {label}
      </Typography>
      {value ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {preview ? (
            <Box component="img" src={preview} alt={`${label}, ready to save`} sx={{ width: 120, aspectRatio: card ? `${CARD_ASPECT}` : 'auto', maxHeight: 120, objectFit: 'cover', borderRadius: '6px', border: 1, borderColor: 'border' }} />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PdfIcon aria-hidden="true" />
              <Typography sx={{ fontSize: '0.875rem' }}>{value.name || 'PDF'}</Typography>
            </Box>
          )}
          <Button onClick={() => onChange(null)} startIcon={<RemoveIcon />} sx={{ minHeight: 44, color: 'text.primary', ml: 'auto' }}>
            Remove
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <ButtonBase
            onClick={() => cameraRef.current?.click()}
            sx={{ minHeight: 64, borderRadius: '6px', border: 1, borderColor: 'border', bgcolor: 'background.card', display: 'grid', placeItems: 'center', gap: 0.25, fontWeight: 700, fontSize: '0.875rem', color: 'text.primary', py: 1 }}
          >
            <CameraIcon aria-hidden="true" />
            Take a photo
          </ButtonBase>
          <ButtonBase
            onClick={() => fileRef.current?.click()}
            sx={{ minHeight: 64, borderRadius: '6px', border: 1, borderColor: 'border', bgcolor: 'background.card', display: 'grid', placeItems: 'center', gap: 0.25, fontWeight: 700, fontSize: '0.875rem', color: 'text.primary', py: 1 }}
          >
            <FileIcon aria-hidden="true" />
            Choose a file
          </ButtonBase>
        </Box>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        data-testid={testId ? `${testId}-camera` : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          take(f);
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        data-testid={testId ? `${testId}-file` : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          take(f);
        }}
      />
      <CropSheet
        open={Boolean(pending)}
        file={pending}
        defaultMode={card ? 'card' : 'whole'}
        onCancel={() => setPending(null)}
        onDone={(f) => {
          setPending(null);
          onChange(f);
        }}
      />
    </Box>
  );
}

import { useState, useEffect } from 'react'
import { loadBackdrop } from '@geeksuite/backdrop'
import { useSettings } from '../hooks/useSettings'
import { BASEGEEK } from '../lib/basegeek'

// Adaptive scrim ramp: linear, clamped. A luminance of 0 (black wallpaper)
// maps to 0.75x the fixed scrim alphas below; 1 (white wallpaper) maps to
// 1.4x. Values in between interpolate. These bounds were picked so a
// mid-grey photo (luminance ~0.5) lands close to 1x — today's tuned-by-eye
// default — while a bright sky photo darkens further and a night photo
// lightens up rather than going muddy.
const SCRIM_MIN = 0.75
const SCRIM_MAX = 1.4
const scrimFactorForLuminance = (luminance) => {
  const t = Math.min(1, Math.max(0, luminance))
  return SCRIM_MIN + t * (SCRIM_MAX - SCRIM_MIN)
}

// Downscale the wallpaper to a small offscreen canvas and average its luma
// (Rec. 601 weights), normalized 0 (black) .. 1 (white). A cross-origin
// image the host didn't answer with CORS headers taints the canvas and
// getImageData throws — caught here and reported as "unknown" (null) so
// the caller falls back to the fixed scrim rather than erroring.
const sampleLuminance = (img) => {
  try {
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)
    let sum = 0
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    return sum / (data.length / 4) / 255
  } catch {
    return null
  }
}

// Photo: a fresh wallpaper, lightly softened behind a gentle scrim. The
// dark-glass panels carry legibility, so the picture stays readable and
// present without being the focal point. Void: no photo, a flat ground with a faint grid and a warm glow.
const BackgroundManager = () => {
  const { settings } = useSettings()
  const photo = settings.backdrop === 'photo'
  const [bgUrl, setBgUrl] = useState(null)
  const [scrimAlpha, setScrimAlpha] = useState(1)

  // One wallpaper per page load, from basegeek's backdrop service
  // (DOCS/BACKDROP_SERVICE_PLAN.md): a batch basegeek refreshes every 48 h
  // from several public sources and serves from our own origin. Until
  // 2026-11-13 this hot-linked picsum.photos directly, and when Picsum went
  // down the wallpaper simply vanished. The helper picks the crop for this
  // viewport (portrait on an upright phone), preloads it, tries another
  // photo if one fails, and resolves null if there is nothing — in which
  // case the plain ground stays, as before.
  useEffect(() => {
    if (!photo || bgUrl) return
    let cancelled = false
    loadBackdrop({ base: BASEGEEK }).then((picked) => {
      if (!cancelled && picked) setBgUrl(picked.url)
    })
    return () => {
      cancelled = true
    }
  }, [photo, bgUrl])

  // Sample the wallpaper's luminance once per wallpaper change, via a
  // second, independent image load. This never touches the <img> that
  // drives the visible wallpaper above: that one is fetched plain (no
  // `crossOrigin`) so it always renders regardless of what the host does
  // with CORS. This probe alone sets `crossOrigin="anonymous"` — basegeek's
  // cors() allow-list includes start.clintgeek.com, so the probe loads and
  // samples cleanly. If CORS ever stops answering, the probe's image load
  // itself fails (onerror) rather than the visible wallpaper; if the host
  // answers the request but the canvas still ends up tainted,
  // `sampleLuminance` catches that too. Either way this falls back to
  // scrimAlpha = 1, today's fixed scrim.
  useEffect(() => {
    if (!bgUrl) return
    let cancelled = false
    const probe = new Image()
    probe.crossOrigin = 'anonymous'
    probe.onload = () => {
      if (cancelled) return
      const luminance = sampleLuminance(probe)
      setScrimAlpha(luminance == null ? 1 : scrimFactorForLuminance(luminance))
    }
    probe.onerror = () => {
      if (cancelled) return
      setScrimAlpha(1)
    }
    probe.src = bgUrl
    return () => {
      cancelled = true
    }
  }, [bgUrl])

  return (
    <div
      className="fixed inset-0 -z-10 pointer-events-none bg-ground"
      aria-hidden="true"
      style={{ '--scrim-alpha': scrimAlpha }}
    >
      {/* Wallpaper. Scaled slightly so the blur never shows a hard edge. */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          backgroundImage: bgUrl ? `url(${bgUrl})` : 'none',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'saturate(0.9) brightness(0.92) blur(2px)',
          transform: 'scale(1.03)',
          opacity: photo && bgUrl ? 1 : 0,
        }}
      />

      {/* Scrim over the photo: light at the top so the sky survives, heavier
          toward the grid. Alpha ramp driven by --scrim-alpha; see
          .wallpaper-scrim in index.css. */}
      <div
        className="wallpaper-scrim absolute inset-0"
        style={{ opacity: photo ? 1 : 0 }}
      />

      {/* Void grid */}
      <div
        className="absolute inset-0 void-grid transition-opacity duration-700"
        style={{ opacity: photo ? 0 : 1 }}
      />

      {/* Warm glow at the top edge, both modes */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(50% 35% at 50% 0%, rgba(230,179,90,0.07), transparent 70%)',
        }}
      />
    </div>
  )
}

export default BackgroundManager

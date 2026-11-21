import { useState, useEffect } from 'react'
import { loadBackdrop } from '@geeksuite/backdrop'
import { useSettings } from '../hooks/useSettings'
import { BASEGEEK } from '../lib/basegeek'
import { sampleLuma, scrimStops } from '../lib/scrim'

// The scrim's three alphas come from the wallpaper's luminance
// (lib/scrim.js): the 2026-09-05 ramp, plus a floor for bright photos so the
// hero's small text clears 4.5:1 over white (design review 2026-11-18).
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
    // The whole photo for the ramp, its top for the floor (lib/scrim.js).
    return sampleLuma(data, size)
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
  const [scrim, setScrim] = useState(() => scrimStops(null))

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
  // the original fixed scrim.
  useEffect(() => {
    if (!bgUrl) return
    let cancelled = false
    const probe = new Image()
    probe.crossOrigin = 'anonymous'
    probe.onload = () => {
      if (cancelled) return
      const luma = sampleLuminance(probe)
      setScrim(luma ? scrimStops(luma.whole, luma.top) : scrimStops(null))
    }
    probe.onerror = () => {
      if (cancelled) return
      setScrim(scrimStops(null))
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
      style={{ '--scrim-top': scrim.top, '--scrim-mid': scrim.mid, '--scrim-bottom': scrim.bottom }}
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
          toward the grid. Alphas from --scrim-top/-mid/-bottom; see
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

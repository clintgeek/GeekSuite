import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import { INTERVALS } from '../constants'
import { useSettings } from '../hooks/useSettings'

const MAX_RETRIES = 3
const RETRY_DELAY = 2000

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
  const retriesRef = useRef(0)
  const [bgUrl, setBgUrl] = useState(null)
  const [scrimAlpha, setScrimAlpha] = useState(1)

  useLayoutEffect(() => {
    if (!photo || bgUrl) return

    let cancelled = false

    const loadBackground = () => {
      // Fetch a wallpaper sized to the actual screen instead of always
      // pulling a fixed 1920×1080 — a phone at 3x DPR needs far less than a
      // desktop, and a huge desktop is capped rather than requesting more.
      const dpr = window.devicePixelRatio || 1
      const width = Math.min(Math.round(window.innerWidth * dpr), 1920)
      const height = Math.round((width * 1080) / 1920)
      const url = `https://picsum.photos/${width}/${height}.webp?t=${Date.now()}`
      const img = new Image()
      let settled = false

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          handleFailure()
        }
      }, INTERVALS.BACKGROUND_TIMEOUT)

      img.onload = () => {
        if (settled || cancelled) return
        settled = true
        clearTimeout(timeout)
        setBgUrl(url)
        retriesRef.current = 0
      }

      img.onerror = () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        handleFailure()
      }

      img.src = url
    }

    const handleFailure = () => {
      if (cancelled) return
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current++
        setTimeout(loadBackground, RETRY_DELAY)
      }
    }

    loadBackground()
    return () => {
      cancelled = true
    }
  }, [photo, bgUrl])

  // Sample the wallpaper's luminance once per wallpaper change, via a
  // second, independent image load. This never touches the <img> that
  // drives the visible wallpaper above: that one is fetched plain (no
  // `crossOrigin`) so it always renders regardless of what the host does
  // with CORS. This probe alone sets `crossOrigin="anonymous"` — picsum.photos
  // answers with `Access-Control-Allow-Origin: *` when an Origin header is
  // present (confirmed by hand), so the probe loads and samples cleanly. If
  // a future wallpaper source doesn't answer CORS at all, the probe's image
  // load itself fails (onerror) rather than the visible wallpaper; if some
  // host answers the request but the canvas still ends up tainted,
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

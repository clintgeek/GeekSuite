import { useLayoutEffect, useRef, useState } from 'react'
import { INTERVALS } from '../constants'
import { useSettings } from '../hooks/useSettings'

const MAX_RETRIES = 3
const RETRY_DELAY = 2000

// Photo: a fresh wallpaper, lightly softened behind a gentle scrim. The
// dark-glass panels carry legibility, so the picture stays readable and
// present without being the focal point. Void: no photo, a flat ground with a faint grid and a warm glow.
const BackgroundManager = () => {
  const { settings } = useSettings()
  const photo = settings.backdrop === 'photo'
  const retriesRef = useRef(0)
  const [bgUrl, setBgUrl] = useState(null)

  useLayoutEffect(() => {
    if (!photo || bgUrl) return

    let cancelled = false

    const loadBackground = () => {
      const url = `https://picsum.photos/1920/1080.webp?t=${Date.now()}`
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

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none bg-ground" aria-hidden="true">
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

      {/* Scrim over the photo: light at the top so the sky survives, heavier toward the grid. */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: photo ? 1 : 0,
          background:
            'linear-gradient(180deg, rgba(10,13,18,0.18) 0%, rgba(10,13,18,0.28) 45%, rgba(10,13,18,0.62) 100%)',
        }}
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

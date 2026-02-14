import { useLayoutEffect, useRef, useState } from 'react'
import { INTERVALS } from '../constants'

const MAX_RETRIES = 3
const RETRY_DELAY = 2000

const BackgroundManager = () => {
  const retriesRef = useRef(0)
  const [bgUrl, setBgUrl] = useState(null)

  useLayoutEffect(() => {
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
        if (settled) return
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

      return () => {
        clearTimeout(timeout)
        settled = true
      }
    }

    const handleFailure = () => {
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current++
        setTimeout(loadBackground, RETRY_DELAY)
      }
    }

    loadBackground()
  }, [])

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden="true">
      {/* Layer 1: Wallpaper image with normalization filters */}
      {/* Scale 110% to hide blur edges bleeding at the frame boundary */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          backgroundImage: bgUrl ? `url(${bgUrl})` : 'none',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'saturate(0.8) brightness(0.92) blur(3px)',
          transform: 'scale(1.04)',
          opacity: bgUrl ? 1 : 0,
        }}
      />

      {/* Layer 2: Cinematic gradient vignette */}
      {/* Top → transparent-ish, Mid → darker, Bottom → darkest */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.25) 0%,
            rgba(0, 0, 0, 0.30) 20%,
            rgba(0, 0, 0, 0.40) 50%,
            rgba(0, 0, 0, 0.55) 80%,
            rgba(0, 0, 0, 0.65) 100%
          )`,
        }}
      />
    </div>
  )
}

export default BackgroundManager

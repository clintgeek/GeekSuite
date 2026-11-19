import { useEffect, useState } from 'react'
import { linkTargetProps, readDisplay, PHONE_QUERY, STANDALONE_QUERY } from '../lib/linkTarget'

/** `target`/`rel` for an app link, following the screen as it changes. */
export function useLinkTarget() {
  const [display, setDisplay] = useState(() => readDisplay())

  useEffect(() => {
    if (!window.matchMedia) return undefined
    const lists = [PHONE_QUERY, STANDALONE_QUERY].map((q) => window.matchMedia(q))
    const update = () => setDisplay(readDisplay())
    lists.forEach((l) => l.addEventListener?.('change', update))
    return () => lists.forEach((l) => l.removeEventListener?.('change', update))
  }, [])

  return linkTargetProps(display)
}

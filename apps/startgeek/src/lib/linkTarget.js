// linkTarget.js — where an app link opens (design review 2026-11-18, #4).
//
// Decision for the night: desktop keeps the new-tab behaviour (StartGeek is a
// tab you keep); a phone-sized screen, or StartGeek installed as an app
// (standalone display), opens in the same tab, so Back returns here and the
// phone does not collect a pile of tabs.

export const PHONE_QUERY = '(max-width: 639px)'
export const STANDALONE_QUERY = '(display-mode: standalone)'

/**
 * @param {{ phone?: boolean, standalone?: boolean }} env
 * @returns {{ target?: string, rel?: string }} props for an <a>
 */
export function linkTargetProps({ phone = false, standalone = false } = {}) {
  if (phone || standalone) return {}
  return { target: '_blank', rel: 'noopener noreferrer' }
}

/** The display as the browser reports it; all false outside a browser. */
export function readDisplay(win = globalThis.window) {
  const match = (q) => {
    try {
      return Boolean(win?.matchMedia?.(q).matches)
    } catch {
      return false
    }
  }
  return {
    phone: match(PHONE_QUERY),
    standalone: match(STANDALONE_QUERY) || win?.navigator?.standalone === true,
  }
}

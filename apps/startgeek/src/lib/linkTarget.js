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

/**
 * Open an app link from code (Enter on a search or Ask result) by the same
 * rule a tap on the link follows: a new tab on the desktop, the same tab on a
 * phone or when installed (a new window there leaves the installed app).
 */
export function openLink(url, display = {}, win = globalThis.window) {
  if (!url || !win) return
  if (display.phone || display.standalone) {
    win.location.assign(url)
    return
  }
  win.open(url, '_blank', 'noopener,noreferrer')
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

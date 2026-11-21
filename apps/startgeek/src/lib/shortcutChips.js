// shortcutChips.js — when the phone's row of `> task`, `< note`, `? suite`,
// `?? ask` chips shows under the command box (design review 2026-11-18, #8).
//
// Only after the person put the box in focus themselves (a tap on it). The
// page focuses the box on load, and Android honours that without a keyboard:
// the chips then lay over the top of the modules from the first paint, and a
// tap meant for a task's tick landed on a chip instead (review 2026-11-20).

/**
 * @param {{ phone: boolean, focused: boolean, userFocused: boolean,
 *   value: string, signedIn: boolean }} state
 */
export function showShortcutChips({ phone, focused, userFocused, value, signedIn }) {
  return Boolean(phone && focused && userFocused && !value && signedIn)
}

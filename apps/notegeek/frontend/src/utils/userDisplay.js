/**
 * Display helpers for the signed-in user.
 *
 * NoteGeek's own `User` model carries only `email`, but the shared session
 * (`getMe()` via `@geeksuite/auth`) can surface a `name` from the basegeek
 * profile too — some users have one, some don't — so the sidebar's footer
 * chip and the top bar's account menu both funnel through here rather than
 * each guessing differently.
 */

/** Best human-readable name we have, or "Writer" when we have nothing. */
export function displayNameFrom(user) {
  const raw = user?.name || user?.username || user?.email?.split('@')[0] || '';
  if (!raw) return 'Writer';
  const first = raw.split(/[._@\s]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Email if we have one; otherwise the username, which is at least stable. */
export function secondaryFrom(user) {
  return user?.email || user?.username || '';
}

/** One or two letters for the avatar fallback. */
export function initialsFrom(user) {
  const raw = user?.name || user?.username || user?.email || '';
  const parts = raw.trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'N';
  return parts.map((part) => part[0].toUpperCase()).join('');
}

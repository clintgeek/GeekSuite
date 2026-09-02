/**
 * Display helpers for the signed-in operator.
 *
 * baseGeek's auth payload (`/auth/profile`) is not uniform — some accounts have
 * a `username`, some only an `email` — so the sidebar footer chip and the top
 * bar account menu funnel through here instead of each guessing differently.
 */

/** Best human-readable handle we have, or "Operator" when we have nothing. */
export function displayNameFrom(user) {
  return (
    user?.username ||
    user?.name ||
    user?.email?.split('@')[0] ||
    'Operator'
  );
}

/**
 * Second line for the chip / menu header. Suppressed when it would only repeat
 * the primary line (accounts whose whole identity is an email).
 */
export function secondaryFrom(user) {
  const email = user?.email || '';
  if (!email) return '';
  return email === displayNameFrom(user) ? '' : email;
}

/** One or two letters for the avatar fallback. */
export function initialsFrom(user) {
  const raw = user?.username || user?.name || user?.email || '';
  const parts = raw.trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'BG';
  return parts.map((part) => part[0].toUpperCase()).join('');
}

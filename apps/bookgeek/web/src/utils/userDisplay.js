/**
 * Display helpers for the signed-in user.
 *
 * BookGeek's session payload comes from `getMe()` and is not uniform — some
 * users have a `username`, some only an email — so the sidebar user chip and
 * the top bar account menu funnel through here instead of each guessing
 * differently. Mirrors flockgeek's `utils/userDisplay.js`.
 */

/** Best human-readable name we have, or "Reader" when we have nothing. */
export function displayNameFrom(user) {
  const raw = user?.name || user?.username || user?.email?.split("@")[0] || "";
  if (!raw) return "Reader";
  const first = raw.split(/[._@\s]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** Email if we have one; otherwise the username, which is at least stable. */
export function secondaryFrom(user) {
  return user?.email || user?.username || "";
}

/** One or two letters for the avatar fallback. */
export function initialsFrom(user) {
  const raw = user?.name || user?.username || user?.email || "";
  const parts = raw.trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return "B";
  return parts.map((part) => part[0].toUpperCase()).join("");
}

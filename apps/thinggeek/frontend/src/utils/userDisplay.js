/** Display helpers for the signed-in user; same rules as GameGeek's. */
export function displayNameFrom(user) {
  const raw = user?.displayName || user?.name || user?.username || user?.email?.split('@')[0] || '';
  if (!raw) return 'Member';
  const first = raw.split(/[._@\s]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export function secondaryFrom(user) {
  return user?.email || user?.username || '';
}

export function initialsFrom(user) {
  const raw = user?.displayName || user?.name || user?.username || user?.email || '';
  const parts = raw.trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return 'T';
  return parts.map((part) => part[0].toUpperCase()).join('');
}

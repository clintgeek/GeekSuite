/** Small helpers shared by the navigation primitives. */

/** "Chef Crocker" → "CC". Used when there is no avatar image and no explicit
 * initials on a user object. */
export function initialsFrom(name) {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

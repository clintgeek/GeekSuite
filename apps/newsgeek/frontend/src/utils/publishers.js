/**
 * Publisher domains, matched the way the gateway matches them (a suffix on a
 * label boundary, packages/schemas/newsgeek/paywalls.js): `nwaonline.com`
 * covers `obits.nwaonline.com`; `notnwaonline.com` is someone else.
 */

/** The entry in `list` that covers `domain` (itself or a parent), or null. */
export function coveringDomain(list = [], domain) {
  if (!domain) return null;
  const d = String(domain).toLowerCase();
  return list.find((e) => d === e || d.endsWith(`.${e}`)) ?? null;
}

export const withDomain = (list = [], domain) => (list.includes(domain) ? list : [...list, domain]);
export const withoutDomain = (list = [], domain) => list.filter((e) => e !== domain);

/** Small helpers shared by the navigation primitives. */
import { Link as RouterLink } from 'react-router-dom';

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

const SIGN_OUT = /(^|[\s_-])(log|sign)[\s_-]?out([\s_-]|$)|^(logout|signout)$/i;

/** A tab bar or rail is navigation, not a session control. Logout items are refused. */
export function isSignOutItem(item) {
  return SIGN_OUT.test(String(item?.id ?? '')) || SIGN_OUT.test(String(item?.label ?? ''));
}

/** Router link, plain anchor, or a bare button — the same rule in every nav. */
export function navLinkProps(item) {
  if (item?.to) return { component: RouterLink, to: item.to };
  if (item?.href) return { component: 'a', href: item.href };
  return {};
}

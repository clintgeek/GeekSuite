/**
 * Shell state, in its own module so the component files stay
 * components-only (React Fast Refresh) and so anything can read the shell
 * without importing the shell.
 */
import { createContext, useContext } from 'react';

const noop = () => {};

/** Defaults for chrome rendered outside a shell (standalone pages, tests). */
export const SHELL_FALLBACK = {
  isMobile: false,
  mobileOpen: false,
  hasNav: false,
  bottomInset: 0,
  openNav: noop,
  closeNav: noop,
  toggleNav: noop,
};

export const GeekShellContext = createContext(SHELL_FALLBACK);

/**
 * Shell state for chrome that needs it: `GeekTopBar`'s hamburger,
 * `GeekSidebar`'s close-on-navigate, `GeekAppFrame`'s bottom inset.
 *
 * @returns {{isMobile: boolean, mobileOpen: boolean, hasNav: boolean,
 *   bottomInset: number, openNav: () => void, closeNav: () => void,
 *   toggleNav: () => void}}
 */
export function useGeekShell() {
  return useContext(GeekShellContext);
}

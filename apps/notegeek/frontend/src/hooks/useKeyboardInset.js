import { useEffect, useState } from 'react';

/**
 * How much of the layout viewport the on-screen keyboard is covering, in px
 * (0 when there is none, or no `visualViewport`). The phone editor's
 * formatting toolbar docks this far above the bottom of the screen, so it
 * rides on top of the keyboard.
 *
 * Ported from BuJoGeek (apps/bujogeek/frontend/src/hooks/useKeyboardInset.js),
 * copied rather than imported: apps do not reach into each other.
 *
 * Chrome on Android resizes only the VISUAL viewport for the keyboard (the
 * default since 108), so `innerHeight - vv.height - vv.offsetTop` is the
 * keyboard. Where the layout viewport resizes instead, this reads 0 and a
 * `bottom: 0` toolbar is already above the keyboard. Anything under 80px is
 * browser chrome (a URL bar collapsing), not a keyboard.
 */
export default function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setInset(covered > 80 ? Math.round(covered) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

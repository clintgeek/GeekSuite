/**
 * Is a box on the part of the page the person can see? That is the VISUAL
 * viewport: on a phone the keyboard covers the page rather than shrinking
 * it, and the browser pans to keep the caret in sight, so a head still
 * inside the layout viewport (all an IntersectionObserver measures) can be
 * off the top of the screen. `vv` is `window.visualViewport` (null: the
 * window is the screen). A box with no size has not been laid out (a test
 * DOM): call it seen, rather than say a failed save twice.
 */
export function onScreen(rect, vv = null) {
  if (!rect || (!rect.width && !rect.height)) return true;
  const top = vv ? vv.offsetTop || 0 : 0;
  const left = vv ? vv.offsetLeft || 0 : 0;
  const height = vv ? vv.height : (typeof window !== 'undefined' ? window.innerHeight : 0);
  const width = vv ? vv.width : (typeof window !== 'undefined' ? window.innerWidth : 0);
  if (!height || !width) return true;
  return rect.bottom > top && rect.top < top + height && rect.right > left && rect.left < left + width;
}

export default onScreen;

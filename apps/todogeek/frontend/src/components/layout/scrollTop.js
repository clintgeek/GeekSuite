/**
 * Scroll the page back to the top. `main[data-pen-frame]` (AppShell) is the
 * scroller; on a two-pane Today the list pane scrolls on its own, so it goes
 * back to the top too.
 */
export function scrollMainToTop() {
  const main = document.querySelector('main[data-pen-frame]');
  if (main) main.scrollTo?.({ top: 0 });
  const list = main?.querySelector('[data-geek-pane="list"]');
  if (list) list.scrollTo?.({ top: 0 });
}

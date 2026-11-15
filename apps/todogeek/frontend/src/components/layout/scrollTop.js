/** Scroll the page back to the top (`main[data-pen-frame]`, in AppShell, is the scroller). */
export function scrollMainToTop() {
  const main = document.querySelector('main[data-pen-frame]');
  if (main) main.scrollTo({ top: 0 });
}

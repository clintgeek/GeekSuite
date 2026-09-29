/**
 * Back from a sub-page (a thing, the add screen): one step back through the
 * app's own history when there is some — so the library's filters, the Where
 * level or the Attention list you came from come back as they were — and to
 * `fallback` when the page was opened cold (a deep link, a share, a reload).
 */
export function goBack(navigate, location, fallback = '/') {
  if (location?.key && location.key !== 'default') navigate(-1);
  else navigate(fallback, { replace: true });
}

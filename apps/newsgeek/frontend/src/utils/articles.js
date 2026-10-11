/**
 * Latest's paging: `limit` per page, `before` = the previous page's nextBefore; "all" sends no section.
 * Filtered to one source (`?source=<id>`, from the Source sheet's "More from…"), it sends `sourceId`
 * and no section: the section flags are put away while a source filter is on.
 */
export const PAGE_SIZE = 30;

export function articleVariables(section, before, sourceId) {
  const vars = { limit: PAGE_SIZE };
  if (sourceId) vars.sourceId = sourceId;
  else if (section && section !== 'all') vars.section = section;
  if (before) vars.before = before;
  return vars;
}

/** "14 paywalled stories hidden" / "1 paywalled story hidden"; null when nothing was. */
export function hiddenPaywalledLine(n) {
  if (!Number.isInteger(n) || n < 1) return null;
  return `${n.toLocaleString('en-US')} paywalled ${n === 1 ? 'story' : 'stories'} hidden`;
}

export const EMPTY_LINE = 'No stories yet — the presses are warming up. Sources are polled every 15–60 minutes.';

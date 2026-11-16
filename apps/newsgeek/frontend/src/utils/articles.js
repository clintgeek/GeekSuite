/**
 * Latest's paging: `limit` per page, `cursor` = the previous page's nextCursor (an opaque
 * publishedAt + id string from the gateway, so stories sharing a second at a page boundary
 * are not skipped — the old date-only `before` skipped them); "all" sends no section.
 * Filtered to one source (`?source=<id>`, from the Source sheet's "More from…"), it sends `sourceId`
 * and no section: the section flags are put away while a source filter is on.
 * `limit` overrides the page size for the first page only (Back restoring a grown list).
 */
export const PAGE_SIZE = 30;
/** The gateway's cap on one page (newsArticles MAX_LIMIT). */
export const MAX_PAGE = 100;

export function articleVariables(section, cursor, sourceId, limit = PAGE_SIZE) {
  const vars = { limit };
  if (sourceId) vars.sourceId = sourceId;
  else if (section && section !== 'all') vars.section = section;
  if (cursor) vars.cursor = cursor;
  return vars;
}

/** How many stories to ask for first: a page, or (Back after a reload) what the reader had loaded. */
export function firstPageLimit(rememberedCount) {
  if (!Number.isInteger(rememberedCount) || rememberedCount <= PAGE_SIZE) return PAGE_SIZE;
  return Math.min(rememberedCount, MAX_PAGE);
}

/** "14 paywalled stories hidden" / "1 paywalled story hidden"; null when nothing was. */
export function hiddenPaywalledLine(n) {
  if (!Number.isInteger(n) || n < 1) return null;
  return `${n.toLocaleString('en-US')} paywalled ${n === 1 ? 'story' : 'stories'} hidden`;
}

export const EMPTY_LINE = 'No stories yet — the presses are warming up. Sources are polled every 15–60 minutes.';

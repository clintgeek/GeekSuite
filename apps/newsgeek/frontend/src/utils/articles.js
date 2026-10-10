/** Latest's paging: `limit` per page, `before` = the previous page's nextBefore; "all" sends no section. */
export const PAGE_SIZE = 30;

export function articleVariables(section, before) {
  const vars = { limit: PAGE_SIZE };
  if (section && section !== 'all') vars.section = section;
  if (before) vars.before = before;
  return vars;
}

export const EMPTY_LINE = 'No stories yet — the presses are warming up. Sources are polled every 15–60 minutes.';

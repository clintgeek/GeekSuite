/** Feed health words (ok | stale | failing | broken | never), derived by the gateway's shared feedHealth(). */
export const HEALTH = {
  ok: { label: 'OK', hint: 'Fetching normally' },
  stale: { label: 'Stale', hint: 'Answers, but nothing new for far longer than usual' },
  failing: { label: 'Failing', hint: 'Recent fetches failed; retrying with back-off' },
  broken: { label: 'Broken', hint: 'Failed too many times in a row, or marked broken' },
  never: { label: 'Never fetched', hint: 'Not fetched yet' },
};

/** The worst health across a source's feeds, for its summary row. */
const SEVERITY = ['ok', 'never', 'stale', 'failing', 'broken'];
export function worstHealth(feeds = []) {
  if (!feeds.length) return 'never';
  return feeds.reduce((worst, f) => (SEVERITY.indexOf(f.health) > SEVERITY.indexOf(worst) ? f.health : worst), 'ok');
}

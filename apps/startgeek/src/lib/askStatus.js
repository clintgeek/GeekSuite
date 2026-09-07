/**
 * The one line under "Ask" that says what happened. Written as a pure function
 * so the copy is testable and honest in the three states a user actually sees:
 *
 *   - the model answered                          → (no status line; the answer is shown)
 *   - the model planned a search                  → "Read as a search."
 *   - the planner did not answer in time / at all → says so, instead of pretending
 *
 * `provider` is null on a GlanceAsk when askService fell back to "search for
 * the literal text" — the 2026-09-06 case where four dead free-tier models ate
 * the 3 s budget and the card said "Matches below" over an empty list.
 */
export function askStatusLine({ ask, loading = false, resultsCount = 0 } = {}) {
  if (loading || !ask) return null;
  if (ask.answer) return null;

  const modelAnswered = Boolean(ask.provider || ask.model);
  const askedForAnswer = ask.intent?.kind === 'answer';
  const none = resultsCount === 0;

  if (!modelAnswered) {
    return none
      ? 'The assistant did not answer in time, so this ran as a plain search. No matches.'
      : 'The assistant did not answer in time, so this ran as a plain search. Matches below.';
  }
  if (askedForAnswer) {
    return none
      ? 'Nothing in your own data answers that, and the search found no matches.'
      : 'Nothing in your own data answers that. The closest matches are below.';
  }
  return none ? 'Read as a search. No matches — tap a term to search for it alone.' : 'Read as a search. Matches below.';
}

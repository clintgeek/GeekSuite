/**
 * `/back` on the client: which checkpoint it would return to and how many
 * turns that throws away, so the play screen can ask before it sends
 * (UX review 2026-11-18, StoryGeek #2).
 *
 * `findCheckpoint` mirrors the server's (backend checkpointService
 * `findCheckpoint`): no argument means the latest checkpoint; otherwise an
 * exact id or a case-insensitive part of the description. The story the
 * play screen holds carries checkpoints as bookmarks (id, description,
 * timestamp, turnNumber) — `storyForClient` in the story controller.
 */

/**
 * Exactly the server's test (`command.startsWith('/back')` on the lowered,
 * trimmed input), so anything the server would treat as a rewind is asked
 * about — even an odd `/backpack`.
 */
export const isBackCommand = (input) => String(input || '').toLowerCase().trim().startsWith('/back');

export function findCheckpoint(story, idOrDescription) {
  const checkpoints = Array.isArray(story?.checkpoints) ? story.checkpoints : [];
  if (!idOrDescription) return checkpoints[checkpoints.length - 1] || null;
  const needle = idOrDescription.toLowerCase();
  return checkpoints.find((cp) =>
    cp.id === idOrDescription || String(cp.description || '').toLowerCase().includes(needle)
  ) || null;
}

/**
 * `{ checkpoint, lostTurns, laterCheckpoints }` for a `/back` input.
 *
 * `checkpoint` is null when nothing matches — or there are no checkpoints at
 * all: the server then answers with its own message and changes nothing,
 * so the play screen sends without asking. `lostTurns` is null when the
 * turn numbers are unknown.
 *
 * `laterCheckpoints` counts the checkpoints made after the target. The
 * server's restore does not touch `story.checkpoints`, and each one is a
 * full snapshot, so returning to an older checkpoint can itself be undone by
 * `/back` to a later one; only turns after the newest checkpoint are gone
 * for good.
 *
 * The parse is the server's exactly, `userInput.replace('/back', '').trim()`
 * — case-sensitive, so `/Back gate` is passed whole as the argument and
 * matches nothing, on both sides.
 */
export function describeBack(story, input) {
  const arg = String(input || '').replace('/back', '').trim();
  const checkpoint = findCheckpoint(story, arg);
  const current = story?.worldState?.turnNumber;
  const lostTurns = checkpoint && Number.isFinite(checkpoint.turnNumber) && Number.isFinite(current)
    ? Math.max(0, current - checkpoint.turnNumber)
    : null;
  const all = Array.isArray(story?.checkpoints) ? story.checkpoints : [];
  const at = checkpoint ? all.indexOf(checkpoint) : -1;
  const laterCheckpoints = at >= 0 ? all.length - 1 - at : 0;
  return { checkpoint, lostTurns, laterCheckpoints };
}

/**
 * What the `/back` confirm says is lost, from `describeBack`'s answer.
 * "Cannot be undone" only when the target is the newest checkpoint: with
 * later ones kept, the player can go forward again to any of them.
 */
export function backConsequence({ lostTurns = null, laterCheckpoints = 0 } = {}) {
  const lost = Number.isFinite(lostTurns)
    ? (lostTurns === 0
      ? 'No turns have been played since it.'
      : `${lostTurns === 1 ? 'The 1 turn' : `The ${lostTurns} turns`} played since then will be removed.`)
    : 'Every turn played since then will be removed.';
  if (!laterCheckpoints) return `${lost} This cannot be undone.`;
  const kept = laterCheckpoints === 1
    ? 'Your later checkpoint is kept, so you can return to it'
    : `Your ${laterCheckpoints} later checkpoints are kept, so you can return to them`;
  return `${lost} ${kept}; turns after the newest one are gone for good.`;
}

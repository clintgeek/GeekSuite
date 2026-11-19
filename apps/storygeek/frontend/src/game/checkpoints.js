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
 * `{ checkpoint, lostTurns }` for a `/back` input. Either may be null: no
 * checkpoint matched (the server will answer with its own message), or the
 * turn numbers are unknown.
 */
export function describeBack(story, input) {
  // The server's own parse: `userInput.replace('/back', '').trim()`.
  const arg = String(input || '').replace('/back', '').trim();
  const checkpoint = findCheckpoint(story, arg);
  const current = story?.worldState?.turnNumber;
  const lostTurns = checkpoint && Number.isFinite(checkpoint.turnNumber) && Number.isFinite(current)
    ? Math.max(0, current - checkpoint.turnNumber)
    : null;
  return { checkpoint, lostTurns };
}

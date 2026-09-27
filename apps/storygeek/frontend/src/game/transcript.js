/**
 * transcript.js — pure helpers for how the play transcript reads as a page.
 *
 * No message carries a "scene" marker, so a scene opening is inferred from
 * what the transcript does know:
 *   - the first narration of the tale opens it;
 *   - a narration the play screen flagged (`opensScene`, set on a
 *     `/reset-scene` answer — that is literally a new scene);
 *   - a narration after a long gap at the table (a new sitting).
 * Those entries get the illuminated drop cap and, after the first, a scene
 * break ornament.
 */
export const NEW_SITTING_GAP_MS = 6 * 60 * 60 * 1000;

const timeOf = (m) => {
  const t = m?.timestamp instanceof Date ? m.timestamp.getTime() : new Date(m?.timestamp).getTime();
  return Number.isFinite(t) ? t : null;
};

export function opensScene(messages, index) {
  const message = messages[index];
  if (!message || message.type !== 'ai') return false;
  if (message.opensScene) return true;
  const earlierNarration = messages.slice(0, index).some((m) => m.type === 'ai');
  if (!earlierNarration) return true;
  const prev = messages[index - 1];
  const a = timeOf(prev);
  const b = timeOf(message);
  return a != null && b != null && b - a > NEW_SITTING_GAP_MS;
}

/**
 * Insert a slash command into the composer without throwing away what the
 * player already typed: a leading command is replaced, anything else becomes
 * the command's argument. `/recall` + "Mira" -> "/recall Mira".
 */
export function applyCommand(current, command) {
  const rest = String(current || '').replace(/^\s*\/\S*\s*/, '').trimStart();
  return rest ? `${command} ${rest}` : `${command} `;
}

/** The slash commands the backend understands (storyController). */
export const COMMANDS = [
  { command: '/recall', hint: 'What do we know about…? Answered from the record; no turn passes.' },
  { command: '/checkpoint', hint: 'Mark this moment so you can return to it.' },
  { command: '/back', hint: 'Return to your latest checkpoint.' },
  { command: '/list-checkpoints', hint: 'List the checkpoints you have made.' },
  { command: '/char', hint: 'Who is in the tale (add a name for one).' },
  { command: '/info', hint: 'Look up a place by name.' },
  { command: '/timeout', hint: 'Step out of the fiction to talk.' },
  { command: '/end', hint: 'Mark the story complete.' },
];

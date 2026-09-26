/**
 * "Not installed anymore — how did it end?" (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md
 * §Installed → Playing). The Playnite import flags a Playing game none of
 * whose copies is installed any more (and all of whose copies are Playnite
 * copies); the detail sheet asks this question and these are the answers.
 *
 * The meanings are DOCS/TASTE_MODEL.md's, via utils/tasteModel.js, so the
 * banner and the shelf picker say the same thing.
 */
import { SHELF_MEANINGS } from './tasteModel';

export const INSTALL_ANSWERS = Object.freeze([
  { action: 'finished', label: 'Finished', meaning: SHELF_MEANINGS.finished.short },
  { action: 'on-hold', label: 'On hold', meaning: SHELF_MEANINGS['on-hold'].short },
  { action: 'abandoned', label: 'Abandoned', meaning: SHELF_MEANINGS.abandoned.short },
  // Not the Playing meaning ("installed and ready to go") — that is exactly what stopped being true.
  { action: 'still-playing', label: 'Still playing', meaning: 'Keep it on Playing — no more asking until it’s reinstalled and removed again' },
]);

export const isFlagged = (game) => game?.me?.installFlag === 'uninstalled';

/** The caller's `me` fields an answer changes — the optimistic write. */
export function patchFor(action) {
  if (action === 'undo') return { shelf: 'playing', installFlag: 'uninstalled' };
  const shelf = action === 'still-playing' ? 'playing' : action;
  return { shelf, installFlag: null, installFlagAt: null };
}

/**
 * The optimistic answer, pure so its properties are testable (the shape of
 * utils/rateGame.js). The banner disappears the instant a button is pressed;
 * a failed save puts back exactly what was there.
 *
 * @param {{ save: (id, action) => Promise<any>, apply: (id, patch) => void }} deps
 * @returns {(game, action) => Promise<{ ok: boolean, previous: object }>}
 */
export function createResolveInstallFlag({ save, apply }) {
  return async function resolve(game, action) {
    const me = game?.me || {};
    const previous = { shelf: me.shelf ?? null, installFlag: me.installFlag ?? null, installFlagAt: me.installFlagAt ?? null };
    if (!game?.id) return { ok: false, previous };
    apply(game.id, patchFor(action));
    try {
      const saved = await save(game.id, action);
      if (!saved) throw new Error('Nothing came back');
      return { ok: true, previous };
    } catch {
      apply(game.id, previous);
      return { ok: false, previous };
    }
  };
}

/** The toast after an answer. */
export function answeredMessage(title, action) {
  const answer = INSTALL_ANSWERS.find((a) => a.action === action);
  if (action === 'still-playing') return `${title} stays on Playing.`;
  return `${title} → ${answer ? answer.label : action}`;
}

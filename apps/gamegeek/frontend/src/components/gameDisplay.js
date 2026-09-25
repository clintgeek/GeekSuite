/** Small display derivations shared by the card, the row and the hero. */
import { yearOf } from '../utils/dates';

/** Stars appear once you have an opinion to give: in play or done, or already rated. */
export const RATEABLE_SHELVES = Object.freeze(['playing', 'finished', 'on-hold', 'abandoned']);

export function canRate(game) {
  if (!game) return false;
  if (typeof game.me?.rating === 'number' && game.me.rating > 0) return true;
  return RATEABLE_SHELVES.includes(game.me?.shelf);
}

/** "2017 · Nintendo EPD" — whichever halves exist. */
export function metaLine(game) {
  const year = yearOf(game);
  const dev = game?.developers?.[0];
  return [year, dev].filter(Boolean).join(' · ');
}

/**
 * GameGeek's wording and type for the shared collection UI
 * (`@geeksuite/collection` `CollectionProvider`): a row is a game, headings
 * are in the display face. One module-level object, so the provider's value
 * never changes identity.
 */
import { DISPLAY_FONT } from '../theme/theme';

export const GAME_COLLECTION = Object.freeze({
  noun: { one: 'game', many: 'games' },
  displayFont: DISPLAY_FONT,
});

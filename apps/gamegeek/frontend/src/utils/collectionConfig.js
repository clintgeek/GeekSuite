/**
 * GameGeek's wording and type for the shared collection UI
 * (`@geeksuite/collection` `CollectionProvider`): a row is a game, headings
 * are in the display face (Bungee, which has one weight). One module-level object, so the provider's value
 * never changes identity.
 */
import { DISPLAY_FONT, DISPLAY_WEIGHT } from '../theme/theme';

export const GAME_COLLECTION = Object.freeze({
  noun: { one: 'game', many: 'games' },
  displayFont: DISPLAY_FONT,
  displayWeight: DISPLAY_WEIGHT,
});

/**
 * ThingGeek's wording and type for the shared collection UI
 * (`@geeksuite/collection` `CollectionProvider`): a row is a thing, headings
 * are in the display face. One module-level object, so the provider's value
 * never changes identity.
 */
import { DISPLAY_FONT } from '../theme/theme';

export const THING_COLLECTION = Object.freeze({
  noun: { one: 'thing', many: 'things' },
  displayFont: DISPLAY_FONT,
});

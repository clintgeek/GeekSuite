/**
 * BookGeek's wording and type for the shared collection UI
 * (`@geeksuite/collection` `CollectionProvider`): a row is a book, and the
 * headings — "Filters", each section, the desktop count — are in the Midnight
 * Reader display face, DM Serif Display, like the sidebar's wordmark. One
 * module-level object, so the provider's value never changes identity.
 */
export const DISPLAY_FONT = '"DM Serif Display", Georgia, serif';

export const BOOK_COLLECTION = Object.freeze({
  noun: { one: "book", many: "books" },
  displayFont: DISPLAY_FONT,
});

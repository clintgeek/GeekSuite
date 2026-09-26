/**
 * App-wide wording and type for the collection UI, set once by the app:
 *
 *   <CollectionProvider value={{ noun: { one: 'game', many: 'games' }, displayFont: DISPLAY_FONT }}>
 *
 *   noun         what one row is — counts ("124 games"), option names
 *                ("Steam, 11 games"), "Show 124 games".
 *   displayFont  the headings' font family (section titles, "Filters", the
 *                desktop result count). Unset: the theme's body font.
 *   displayWeight (optional) the weight those headings use. Unset: the
 *                package's own (600–700). A display face cut in one weight
 *                (BookGeek's DM Serif Display is 400 only) sets it, or the
 *                browser fakes a bold.
 *
 * Without a provider the defaults are neutral ("item"/"items").
 */
import { createContext, createElement, useContext, useMemo } from 'react';

export const DEFAULT_COLLECTION_CONFIG = Object.freeze({
  noun: Object.freeze({ one: 'item', many: 'items' }),
  displayFont: undefined,
  displayWeight: undefined,
});

const CollectionContext = createContext(DEFAULT_COLLECTION_CONFIG);

export function CollectionProvider({ value, children }) {
  // Pass a module-level constant: a new object each render re-renders every consumer.
  const merged = useMemo(
    () => ({ ...DEFAULT_COLLECTION_CONFIG, ...value, noun: { ...DEFAULT_COLLECTION_CONFIG.noun, ...value?.noun } }),
    [value]
  );
  return createElement(CollectionContext.Provider, { value: merged }, children);
}

export function useCollectionConfig() {
  return useContext(CollectionContext);
}

/** "1 game" / "12 games". */
export function countNoun(count, noun) {
  return `${count} ${count === 1 ? noun.one : noun.many}`;
}

// @geeksuite/collection — client building blocks for a faceted, URL-driven
// collection list (GameGeek's library, BookGeek's next). Domain knowledge —
// fields, facets, labels, sorts, URL keys, section order — comes in as
// config; see DOCS/BOOKGEEK_CLEANUP_PLAN.md "Phase C1" for the API.

// Config
export { CollectionProvider, useCollectionConfig, countNoun, DEFAULT_COLLECTION_CONFIG } from './config';

// Filter state ↔ URL
export { createFilterCodec, integerBetween, newSeed } from './filter/codec';
export { useCollectionFilter } from './filter/useCollectionFilter';

// Facets and chips (pure)
export { buildFacetOptions, visibleOptions, groupOptions, sectionOptions, sectionActiveCount } from './facets/options';
export { buildActiveChips, rangeLabel, suggestViewName } from './facets/chips';

// UI
export { default as FacetSection } from './ui/FacetSection';
export { default as FacetOptions, OptionRow, ShowMoreButton } from './ui/FacetOptions';
export { default as GroupedFacetOptions } from './ui/GroupedFacetOptions';
export { default as RangeFacet } from './ui/RangeFacet';
export { default as FilterSections, MatchToggle, SwitchRow } from './ui/FilterSections';
export { default as FilterPanel, PANEL_WIDTH } from './ui/FilterPanel';
export { default as FiltersSheet } from './ui/FiltersSheet';
export { default as ActiveChips } from './ui/ActiveChips';
export { default as SortMenu } from './ui/SortMenu';
export { default as SaveViewDialog } from './ui/SaveViewDialog';
export { default as SavedViews } from './ui/SavedViews';
export { default as LibraryHeader, FiltersButton } from './ui/LibraryHeader';
export { pillSx, countText, showLabel, useSectionOpen } from './ui/filterUi';

// Hooks
export { useDebouncedValue } from './hooks/useDebouncedValue';
export { useFacetQuery, FACET_DEBOUNCE_MS } from './hooks/useFacetQuery';
export { usePagedList } from './hooks/usePagedList';
export { useScrollMemory, savedScroll } from './hooks/useScrollMemory';
export { useInfiniteSentinel } from './hooks/useInfiniteSentinel';

// Apollo cache
export {
  mergePagedList,
  pagedListPolicy,
  refreshPagedList,
  removeFromPagedLists,
  evictRootFields,
  installTypePoliciesOnce,
} from './cache/pagedList';

// @geeksuite/collection/server — Mongo query helpers for the gateway's
// collection resolvers (search, faceted counts, sorts, paging). No React, no
// tenant scoping: the app resolver owns the household/user base $match.
export {
  searchRegex,
  buildSearchFilter,
  inList,
  yearRange,
  numberRange,
  matchOf,
  buildFacetStage,
  valuesFacetStages,
  groupFacetStages,
  countFacetStages,
  histogramStages,
  yearHistogramStages,
  shapeOpenFacet,
  shapeFixedFacet,
  shapeHistogram,
  shapeCount,
  randomSortKey,
  nullsLastSort,
  pageArgs,
  pageFacetStage,
  shapePage,
} from './query.js';

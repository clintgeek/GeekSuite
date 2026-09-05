/**
 * The library's sort fields — one list for the toolbar pill's label and the
 * filter sheet's toggle group, so the two can never drift. Values match the
 * `sort` argument the books query already accepted (the old `<select>`).
 */
export const SORT_LABELS = {
  title: "Title",
  author: "Author",
  dateAdded: "Added",
  rating: "Rating",
  dateFinished: "Date finished",
  pageCount: "Page count",
  publishedDate: "Published",
  owned: "Owned",
};

/** Display order in the filter sheet: the four common sorts first. */
export const SORT_ORDER = [
  "title",
  "author",
  "dateAdded",
  "rating",
  "dateFinished",
  "pageCount",
  "publishedDate",
  "owned",
];

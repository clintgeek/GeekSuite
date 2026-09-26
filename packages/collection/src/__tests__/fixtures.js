/**
 * A books-shaped configuration, so the package's tests prove the pieces work
 * for a second domain — not only for GameGeek, whose own integration tests
 * live in apps/gamegeek/frontend.
 */
import { createFilterCodec, integerBetween } from '../filter/codec';

export const BOOK_SORTS = {
  order: ['title', 'author', 'dateAdded', 'rating', 'random'],
  default: 'title',
  random: 'random',
  defaultDir: { title: 'asc', author: 'asc', dateAdded: 'desc', rating: 'desc', random: 'asc' },
  labels: { title: 'Title', author: 'Author', dateAdded: 'Recently added', rating: 'Rating', random: 'Shuffle' },
  short: { dateAdded: 'Added' },
  dirLabels: {
    title: { asc: 'A → Z', desc: 'Z → A' },
    author: { asc: 'A → Z', desc: 'Z → A' },
    dateAdded: { asc: 'Oldest first', desc: 'Newest first' },
    rating: { asc: 'Lowest first', desc: 'Highest first' },
  },
};

export const FORMATS = ['epub', 'pdf', 'mobi', 'paper'];

export const BOOK_CODEC = createFilterCodec({
  fields: [
    { key: 'q', type: 'search', param: 'q' },
    { key: 'shelves', type: 'list', param: 'shelf', drop: ['all'] },
    { key: 'authors', type: 'list', param: 'author' },
    { key: 'series', type: 'list', param: 'series' },
    { key: 'tags', type: 'list', param: 'tag' },
    { key: 'formats', type: 'list', param: 'format', values: FORMATS },
    { key: 'tagMatch', type: 'enum', param: 'match', values: ['any', 'all'], default: 'any', counts: false, requires: ['tags'] },
    { key: 'owned', type: 'boolean', param: 'owned' },
    { key: 'hasFile', type: 'flag', param: 'file' },
    { key: 'readYear', type: 'range', param: 'read', minKey: 'readYearMin', maxKey: 'readYearMax', parse: integerBetween(1900, 2100) },
    { key: 'rating', type: 'range', param: 'stars', minKey: 'ratingMin', maxKey: 'ratingMax', parse: integerBetween(1, 5) },
  ],
  state: [{ key: 'view', param: 'v', values: ['compact'], default: 'full' }],
  sorts: BOOK_SORTS,
});

export const fv = (pairs) => pairs.map(([value, count]) => ({ value, count }));

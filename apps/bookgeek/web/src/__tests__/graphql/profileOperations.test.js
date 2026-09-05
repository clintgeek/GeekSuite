/**
 * The profile / AI-status GraphQL operations, added 2026-09-05 when bookgeek's
 * pure-data REST (`/api/profile/*`, `/api/ai/status`) moved to basegeek's
 * gateway. These documents are the contract with
 * `apps/basegeek/packages/api/src/graphql/bookgeek/typeDefs.js`; a typo in a
 * field name here is a runtime GraphQL error nothing else in this suite would
 * catch, because App.jsx builds them by hand rather than through a hook.
 */
import { describe, it, expect } from 'vitest';
import { print } from 'graphql';
import {
  GET_BOOK_PROFILE,
  GET_LIBRARY_FILTERS,
  GET_AI_STATUS,
} from '../../graphql/queries.js';
import {
  SAVE_BOOK_PROFILE,
  SAVE_LIBRARY_FILTER,
  DELETE_LIBRARY_FILTER,
  ADD_BOOK_SHELF,
  REMOVE_BOOK_SHELF,
} from '../../graphql/mutations.js';

const operationOf = (doc) => doc.definitions.find((d) => d.kind === 'OperationDefinition');
const rootFieldOf = (doc) => operationOf(doc).selectionSet.selections[0].name.value;

// The saved-filter shape App.jsx hands straight to the filter pills and the
// FilterSheet; dropping one silently un-restores that part of a preset.
const SAVED_FILTER_FIELDS = [
  'id', 'name', 'sortBy', 'sortDir', 'searchQuery',
  'authorFilter', 'tagFilter', 'shelfFilter', 'ownedOnly', 'ownedFilter',
];

describe('profile GraphQL operations', () => {
  it('every document parses and carries exactly one named operation', () => {
    for (const doc of [
      GET_BOOK_PROFILE, GET_LIBRARY_FILTERS, GET_AI_STATUS,
      SAVE_BOOK_PROFILE, SAVE_LIBRARY_FILTER, DELETE_LIBRARY_FILTER,
      ADD_BOOK_SHELF, REMOVE_BOOK_SHELF,
    ]) {
      const ops = doc.definitions.filter((d) => d.kind === 'OperationDefinition');
      expect(ops).toHaveLength(1);
      expect(ops[0].name?.value).toEqual(expect.any(String));
    }
  });

  it('queries hit the gateway root fields App.jsx reads back', () => {
    expect(rootFieldOf(GET_BOOK_PROFILE)).toBe('bookProfile');
    expect(rootFieldOf(GET_LIBRARY_FILTERS)).toBe('libraryFilters');
    expect(rootFieldOf(GET_AI_STATUS)).toBe('bookAiStatus');
    for (const doc of [GET_BOOK_PROFILE, GET_LIBRARY_FILTERS, GET_AI_STATUS]) {
      expect(operationOf(doc).operation).toBe('query');
    }
  });

  it('mutations hit the gateway root fields App.jsx reads back', () => {
    expect(rootFieldOf(SAVE_BOOK_PROFILE)).toBe('saveBookProfile');
    expect(rootFieldOf(SAVE_LIBRARY_FILTER)).toBe('saveLibraryFilter');
    expect(rootFieldOf(DELETE_LIBRARY_FILTER)).toBe('deleteLibraryFilter');
    expect(rootFieldOf(ADD_BOOK_SHELF)).toBe('addBookShelf');
    expect(rootFieldOf(REMOVE_BOOK_SHELF)).toBe('removeBookShelf');
    for (const doc of [
      SAVE_BOOK_PROFILE, SAVE_LIBRARY_FILTER, DELETE_LIBRARY_FILTER,
      ADD_BOOK_SHELF, REMOVE_BOOK_SHELF,
    ]) {
      expect(operationOf(doc).operation).toBe('mutation');
    }
  });

  it('variable types match the gateway schema', () => {
    const varTypes = (doc) =>
      Object.fromEntries(
        operationOf(doc).variableDefinitions.map((v) => [v.variable.name.value, print(v.type)])
      );
    expect(varTypes(SAVE_BOOK_PROFILE)).toEqual({ input: 'BookProfileInput!' });
    expect(varTypes(SAVE_LIBRARY_FILTER)).toEqual({ input: 'SaveLibraryFilterInput!' });
    expect(varTypes(DELETE_LIBRARY_FILTER)).toEqual({ id: 'String!' });
    expect(varTypes(ADD_BOOK_SHELF)).toEqual({ label: 'String!' });
    expect(varTypes(REMOVE_BOOK_SHELF)).toEqual({ id: 'String!' });
    expect(operationOf(GET_BOOK_PROFILE).variableDefinitions).toHaveLength(0);
  });

  it('asks for every saved-filter field a restored preset needs', () => {
    for (const doc of [GET_BOOK_PROFILE, GET_LIBRARY_FILTERS, SAVE_LIBRARY_FILTER, DELETE_LIBRARY_FILTER]) {
      const text = print(doc);
      for (const field of SAVED_FILTER_FIELDS) {
        expect(text).toContain(field);
      }
    }
  });

  it('asks for the profile fields Settings renders', () => {
    for (const doc of [GET_BOOK_PROFILE, SAVE_BOOK_PROFILE, ADD_BOOK_SHELF, REMOVE_BOOK_SHELF]) {
      const text = print(doc);
      expect(text).toContain('kindleEmail');
      expect(text).toContain('deviceWord');
      expect(text).toContain('customShelves');
      expect(text).toContain('label');
    }
    expect(print(REMOVE_BOOK_SHELF)).toContain('clearedBooks');
  });

  it('asks for the two AI-status flags SettingsView renders', () => {
    const text = print(GET_AI_STATUS);
    expect(text).toContain('enabled');
    expect(text).toContain('apiKeyConfigured');
  });
});

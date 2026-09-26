/**
 * The paged list against a real InMemoryCache: pages merge into one list,
 * a page-1 refresh never collapses it, a delete takes one row out without a
 * refetch. A books-shaped query, so nothing here leans on GameGeek's names
 * (its own integration test drives the same machinery through its edit
 * mutations: apps/gamegeek/frontend/src/__tests__/hooks/libraryPagination.test.jsx).
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { ApolloClient, ApolloLink, ApolloProvider, InMemoryCache, Observable, gql } from '@apollo/client';
import { evictRootFields, installTypePoliciesOnce, mergePagedList, pagedListPolicy, refreshPagedList, removeFromPagedLists } from '../cache/pagedList';
import { usePagedList } from '../hooks/usePagedList';
import { useFacetQuery } from '../hooks/useFacetQuery';

const GET_BOOKS = gql`
  query GetBooks($page: Int, $limit: Int, $sort: String) {
    books(page: $page, limit: $limit, sort: $sort) {
      total
      rows {
        id
        title
      }
    }
  }
`;
const GET_FACETS = gql`
  query GetBookFacets($filter: JSON) {
    bookFacets(filter: $filter) {
      total
    }
  }
`;

const LIMIT = 10;
const book = (i) => ({ __typename: 'Book', id: `b${i}`, title: `Book ${String(i).padStart(3, '0')}` });

function makeClient(all) {
  const ops = [];
  const link = new ApolloLink(
    (op) =>
      new Observable((obs) => {
        ops.push({ name: op.operationName, variables: op.variables });
        if (op.operationName === 'GetBooks') {
          const { page = 1, limit = LIMIT } = op.variables;
          obs.next({ data: { books: { __typename: 'BookPage', total: all.length, rows: all.slice((page - 1) * limit, page * limit) } } });
        } else {
          obs.next({ data: { bookFacets: { __typename: 'BookFacets', total: op.variables.filter ? 1 : all.length } } });
        }
        obs.complete();
      })
  );
  const client = new ApolloClient({ link, cache: new InMemoryCache() });
  const policies = { Query: { fields: { books: pagedListPolicy({ keyArgs: ['sort'], itemsField: 'rows' }) } } };
  installTypePoliciesOnce(client, policies);
  installTypePoliciesOnce(client, policies); // idempotent
  return { client, ops };
}

const variables = (page) => ({ page, limit: LIMIT, sort: 'title' });

function mount(client, hook) {
  const api = {};
  function Probe() {
    Object.assign(api, hook());
    return null;
  }
  render(
    <ApolloProvider client={client}>
      <Probe />
    </ApolloProvider>
  );
  return api;
}

describe('mergePagedList', () => {
  const merge = mergePagedList('rows');
  const refs = (...ids) => ids.map((id) => ({ __ref: `Book:${id}` }));

  it('page 1 replaces the head and keeps the tail; later pages append without duplicates', () => {
    const existing = { total: 5, rows: refs(1, 2, 3, 4) };
    expect(merge(existing, { total: 6, rows: refs(0, 1) }, { args: { page: 1 } }).rows).toEqual(refs(0, 1, 3, 4));
    expect(merge(existing, { total: 5, rows: refs(4, 5) }, { args: { page: 3 } }).rows).toEqual(refs(1, 2, 3, 4, 5));
    expect(merge(undefined, { total: 2, rows: refs(1, 2) }, { args: {} }).total).toBe(2);
    expect(merge(existing, null, { args: {} })).toBe(existing);
  });
});

describe('usePagedList + the cache helpers', () => {
  it('loads pages into one list, refreshes in place, and removes a row without a refetch', async () => {
    const all = Array.from({ length: 25 }, (_, i) => book(i + 1));
    const { client, ops } = makeClient(all);
    const api = mount(client, () => usePagedList(GET_BOOKS, { variables, field: 'books', itemsField: 'rows', pageSize: LIMIT }));
    await waitFor(() => expect(api.items).toHaveLength(10));
    expect(api.hasMore).toBe(true);
    await act(() => api.loadMore());
    await waitFor(() => expect(api.items).toHaveLength(20));
    await act(() => api.loadMore());
    await waitFor(() => expect(api.items).toHaveLength(25));
    expect(api.hasMore).toBe(false);

    // A create: one request for everything loaded, merged over the list.
    all.unshift(book(0));
    await act(() => refreshPagedList(client, { query: GET_BOOKS, variables: variables(1), field: 'books', itemsField: 'rows', pageSize: LIMIT }));
    const refresh = ops.filter((o) => o.name === 'GetBooks').at(-1);
    expect(refresh.variables.limit).toBe(25);
    await waitFor(() => expect(api.items[0].id).toBe('b0'));
    // As many rows as were loaded, shifted by the newcomer — nothing collapsed.
    expect(api.items).toHaveLength(25);
    expect(api.page.total).toBe(26);
    expect(api.hasMore).toBe(true);

    // A delete: out of the list and the total, no request.
    const before = ops.length;
    act(() => removeFromPagedLists(client.cache, { field: 'books', itemsField: 'rows', typename: 'Book', id: 'b5' }));
    await waitFor(() => expect(api.items).toHaveLength(24));
    expect(api.items.some((b) => b.id === 'b5')).toBe(false);
    expect(api.page.total).toBe(25);
    expect(ops.length).toBe(before);
  });

  it('evictRootFields drops the lists so they reload', async () => {
    const { client, ops } = makeClient([book(1)]);
    const api = mount(client, () => usePagedList(GET_BOOKS, { variables, field: 'books', itemsField: 'rows' }));
    await waitFor(() => expect(api.items).toHaveLength(1));
    const n = ops.length;
    act(() => evictRootFields(client, ['books']));
    await waitFor(() => expect(ops.length).toBe(n + 1));
  });
});

describe('useFacetQuery', () => {
  it('one base request when nothing narrows; a debounced live request, base kept alongside', async () => {
    const { client, ops } = makeClient([book(1), book(2)]);
    const api = {};
    function Probe({ filterInput }) {
      Object.assign(api, useFacetQuery(GET_FACETS, filterInput, { field: 'bookFacets', delay: 20 }));
      return null;
    }
    const ui = (filterInput) => (
      <ApolloProvider client={client}>
        <Probe filterInput={filterInput} />
      </ApolloProvider>
    );
    const { rerender } = render(ui(null));
    await waitFor(() => expect(api.base?.total).toBe(2));
    expect(api.current).toBe(api.base);
    expect(ops.filter((o) => o.name === 'GetBookFacets')).toHaveLength(1);
    rerender(ui({ tags: ['Cozy'] }));
    // Settling: loading, but nothing blanks.
    expect(api.loading).toBe(true);
    expect(api.base.total).toBe(2);
    await waitFor(() => expect(api.current?.total).toBe(1));
    expect(api.base.total).toBe(2);
    expect(ops.filter((o) => o.name === 'GetBookFacets').at(-1).variables).toEqual({ filter: { tags: ['Cozy'] } });
  });
});

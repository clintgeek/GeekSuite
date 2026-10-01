import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import WhereView from '../../views/WhereView';
import WherePicker from '../../components/WherePicker';
import { UPDATE_THING } from '../../graphql/mutations';
import { GET_THING_TREE, GET_THING_TYPES } from '../../graphql/queries';
import { mockViewport, renderWithProviders } from '../testUtils';
import { NODES, TYPES, makeThing } from '../fixtures';

const many = (m) => ({ ...m, maxUsageCount: 20 });
const treeMock = (nodes = NODES) => many({ request: { query: GET_THING_TREE }, result: { data: { thingTree: nodes } } });
const typesMock = many({ request: { query: GET_THING_TYPES }, result: { data: { thingTypes: TYPES } } });

describe('the Where page', () => {
  it('is the tree of locations and containers, each opening its thing, with counts inside', async () => {
    renderWithProviders(<WhereView />, { mocks: [treeMock(), typesMock] });
    await screen.findByText('Shelf 2');
    const rows = screen.getAllByTestId('where-row');
    expect(rows.map((r) => [within(r).getAllByRole('link')[0].textContent, r.getAttribute('data-depth'), r.getAttribute('data-kind')])).toEqual([
      ['House5 things', '0', 'location'],
      ['Garage4 things', '1', 'location'],
      ['Shelf 2Empty', '2', 'location'],
      ['VanVehicle1 thing', '2', 'container'],
      ['WendyBoatEmpty', '2', 'container'],
    ]);
    expect(within(rows[3]).getAllByRole('link')[0]).toHaveAttribute('href', '/thing/n-van');
    // Items aren't rows of the tree…
    expect(screen.queryByText('Jumper cables')).toBeNull();
  });

  it('…until their container is expanded', async () => {
    renderWithProviders(<WhereView />, { mocks: [treeMock(), typesMock] });
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 thing kept directly in Van' }));
    expect(screen.getByRole('link', { name: /Jumper cables/ })).toHaveAttribute('href', '/thing/t-cables');
    expect(screen.getByRole('button', { name: 'Hide 1 thing kept directly in Van' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('things not anywhere, and things inside something in the Trash, are listed apart', async () => {
    const nodes = [...NODES, { ...NODES[4], id: 't-flares', name: 'Flares', parentId: 'n-gone', parentInTrash: true }];
    renderWithProviders(<WhereView />, { mocks: [treeMock(nodes), typesMock] });
    const nowhere = await screen.findByTestId('where-nowhere');
    expect(nowhere).toHaveTextContent('Not anywhere yet · 1');
    const trash = screen.getByTestId('where-in-trash');
    expect(trash).toHaveTextContent('Inside something in the Trash · 1');
    fireEvent.click(within(trash).getByRole('button', { expanded: false }));
    expect(within(trash).getByRole('link', { name: /Flares/ })).toBeInTheDocument();
  });

  it('Move to… offers everything but the thing and what is inside it, and moves it', async () => {
    const moved = vi.fn(() => ({ data: { updateThing: { ...makeThing({ id: 'n-garage', name: 'Garage', parentId: null, path: [] }) } } }));
    renderWithProviders(<WhereView />, {
      mocks: [treeMock(), typesMock, { request: { query: UPDATE_THING, variables: { id: 'n-garage', input: { parentId: null } } }, result: moved }],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Garage: more' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to…' }));
    const list = await screen.findByRole('listbox', { name: 'Move inside' });
    // Not the Garage, nor its Shelf, Van, cables or Wendy — but items elsewhere may hold things. (House holds 5.)
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Top level', 'House5', 'Ruger 10/22', 'Keyboard']);
    fireEvent.click(within(list).getByRole('option', { name: 'Top level' }));
    await waitFor(() => expect(moved).toHaveBeenCalled());
  });

  it('Add a thing here opens the add flow already pointed there', async () => {
    function Add() {
      const location = useLocation();
      return <p>Adding into {location.state?.parentId}</p>;
    }
    renderWithProviders(
      <Routes>
        <Route path="/where" element={<WhereView />} />
        <Route path="/add" element={<Add />} />
      </Routes>,
      { initialEntries: ['/where'], mocks: [treeMock(), typesMock] }
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Van: more' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add a thing here' }));
    expect(await screen.findByText('Adding into n-van')).toBeInTheDocument();
  });
});

describe('the "where is it?" picker', () => {
  it('offers locations and containers only — never a plain item', async () => {
    renderWithProviders(<WherePicker value="n-van" onChange={() => {}} />, { mocks: [treeMock(), typesMock] });
    const field = await screen.findByRole('button', { name: 'Where it is: House › Garage › Van. Change' });
    fireEvent.click(field);
    const list = await screen.findByRole('listbox', { name: 'Where it is' });
    // Each with how many things are inside it.
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Nowhere yet', 'House5', 'Garage4', 'Shelf 2', 'Van1', 'Wendy']);
    expect(within(list).getByRole('option', { name: /^Van/ })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('the Where page on a phone: a drill-down, not a tree', () => {
  let restore;
  beforeEach(() => {
    restore = mockViewport(390);
  });
  afterEach(() => restore());

  function Add() {
    const location = useLocation();
    return <p>Adding into {location.state?.parentId}</p>;
  }
  const renderAt = (entry) =>
    renderWithProviders(
      <Routes>
        <Route path="/where" element={<WhereView />} />
        <Route path="/add" element={<Add />} />
      </Routes>,
      { initialEntries: [entry], mocks: [treeMock(), typesMock] }
    );

  it('the top level is the places that are not inside anything, each a unit with its label, and no indented rows', async () => {
    renderAt('/where');
    const level = await screen.findByTestId('where-level');
    expect(level).toHaveAttribute('data-at', '');
    const places = within(level).getAllByTestId('where-level-place');
    expect(places.map((p) => within(p).getByTestId('moving-label').textContent)).toEqual(['House']);
    expect(screen.queryAllByTestId('where-row')).toHaveLength(0);
    // Tapping a place looks inside it.
    expect(within(places[0]).getByRole('link', { name: /^House: .*Look inside$/ })).toHaveAttribute('href', '/where?at=n-house');
  });

  it('one level in: its places first, then what is kept there, under a label breadcrumb back up', async () => {
    renderAt('/where?at=n-house');
    const level = await screen.findByTestId('where-level');
    expect(level).toHaveAttribute('data-at', 'n-house');
    const crumbsNav = within(level).getByRole('navigation', { name: 'Where you are' });
    expect(within(crumbsNav).getByRole('link', { name: 'Where' })).toHaveAttribute('href', '/where');
    // The current level is on its label but not a link to itself.
    expect(within(crumbsNav).getByText('House').closest('a')).toBeNull();
    expect(within(level).getAllByTestId('where-level-place').map((p) => within(p).getByTestId('moving-label').textContent)).toEqual(['Garage']);
    const kept = within(level).getAllByTestId('where-level-item');
    expect(kept.map((k) => within(k).getByRole('link').getAttribute('href'))).toEqual(['/thing/t-rifle']);
  });

  it('two levels in, the crumbs link each level back to itself; Add here points the add screen here', async () => {
    renderAt('/where?at=n-garage');
    const crumbsNav = await screen.findByRole('navigation', { name: 'Where you are' });
    expect(within(crumbsNav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['Where', '/where'],
      ['House', '/where?at=n-house'],
    ]);
    // Places (Shelf 2, the Van, the boat) drill further.
    expect(screen.getAllByTestId('where-level-place').map((p) => within(p).getByTestId('moving-label').textContent)).toEqual(['Shelf 2', 'Van', 'Wendy']);
    await act(async () => {
      fireEvent.click(screen.getByTestId('where-add-here'));
    });
    expect(await screen.findByText('Adding into n-garage')).toBeInTheDocument();
  });

  it('an unknown level falls back to the top', async () => {
    renderAt('/where?at=gone');
    const level = await screen.findByTestId('where-level');
    expect(level).toHaveAttribute('data-at', '');
  });
});

describe('the Where tree on a desk', () => {
  it('lines up: every row is the same grid, a fixed indent per level then a 44px toggle column', async () => {
    renderWithProviders(<WhereView />, { mocks: [treeMock(), typesMock] });
    await screen.findByText('Shelf 2');
    const grid = (row) => row.firstElementChild.style.gridTemplateColumns || getComputedStyle(row.firstElementChild).gridTemplateColumns;
    const rows = screen.getAllByTestId('where-row');
    // Van (expandable) and Shelf 2 (not) sit at the same depth: identical columns, so their names line up.
    const shelf = rows.find((r) => r.textContent.startsWith('Shelf 2'));
    const van = rows.find((r) => r.textContent.startsWith('Van'));
    expect(grid(shelf)).toBe(grid(van));
    expect(grid(van)).toMatch(/^48px 44px/);
  });
});

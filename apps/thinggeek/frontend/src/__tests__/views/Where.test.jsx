import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router-dom';
import WhereView from '../../views/WhereView';
import WherePicker from '../../components/WherePicker';
import { UPDATE_THING } from '../../graphql/mutations';
import { GET_THING_TREE, GET_THING_TYPES } from '../../graphql/queries';
import { renderWithProviders } from '../testUtils';
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

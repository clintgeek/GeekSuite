import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import PlacesView, { countsText } from '../../views/PlacesView';
import { DELETE_PLACE, UPDATE_PLACE } from '../../graphql/mutations';
import { GET_PLACES } from '../../graphql/queries';
import { renderWithProviders } from '../testUtils';
import { PLACES } from '../fixtures';

const placesMock = { request: { query: GET_PLACES }, result: { data: { places: PLACES } }, maxUsageCount: 20 };

describe('places tree manager', () => {
  it('counts read naturally', () => {
    expect(countsText({ directCount: 2, totalCount: 5 })).toBe('2 here · 5 in all');
    expect(countsText({ directCount: 2, totalCount: 2 })).toBe('2 things');
    expect(countsText({ directCount: 1, totalCount: 1 })).toBe('1 thing');
    expect(countsText({ directCount: 0, totalCount: 0 })).toBe('Empty');
  });

  it('renders the tree with depth and counts, each a library link', async () => {
    renderWithProviders(<PlacesView />, { mocks: [placesMock] });
    await screen.findByText('Shelf 2');
    const rows = screen.getAllByTestId('place-row');
    expect(rows.map((r) => [within(r).getAllByRole('link')[0].textContent, r.getAttribute('data-depth')])).toEqual([
      ['House1 here · 5 in all', '0'],
      ['Garage2 here · 4 in all', '1'],
      ['Shelf 22 things', '2'],
      ['TruckEmpty', '0'],
    ]);
    expect(within(rows[1]).getByRole('link')).toHaveAttribute('href', '/?in=pl-garage');
  });

  it('delete says children move up and things become unplaced, then deletes', async () => {
    const deleted = vi.fn(() => ({ data: { deletePlace: { __typename: 'DeleteResponse', success: true, message: null } } }));
    renderWithProviders(<PlacesView />, { mocks: [placesMock, { request: { query: DELETE_PLACE, variables: { id: 'pl-garage' } }, result: deleted }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Garage: more' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const summary = await screen.findByTestId('delete-place-summary');
    expect(summary).toHaveTextContent('Shelf 2 moves up to House.');
    expect(summary).toHaveTextContent('The 2 things kept directly here become unplaced.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleted).toHaveBeenCalled());
    expect(await screen.findByText('Garage deleted.')).toBeInTheDocument();
  });

  it('rename sends the new name', async () => {
    const renamed = vi.fn(() => ({ data: { updatePlace: { ...PLACES[3], name: 'F-150' } } }));
    renderWithProviders(<PlacesView />, { mocks: [placesMock, { request: { query: UPDATE_PLACE, variables: { id: 'pl-truck', input: { name: 'F-150' } } }, result: renamed }] });
    fireEvent.click(await screen.findByRole('button', { name: 'Truck: more' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const box = await screen.findByRole('textbox', { name: 'Name' });
    expect(box).toHaveValue('Truck');
    fireEvent.change(box, { target: { value: 'F-150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(renamed).toHaveBeenCalled());
  });

  it('move offers only places outside its own subtree', async () => {
    renderWithProviders(<PlacesView />, { mocks: [placesMock] });
    fireEvent.click(await screen.findByRole('button', { name: 'House: more' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move…' }));
    const list = await screen.findByRole('listbox', { name: 'Places' });
    expect(within(list).getAllByRole('option').map((o) => o.textContent)).toEqual(['Top level', 'Truck']);
  });
});

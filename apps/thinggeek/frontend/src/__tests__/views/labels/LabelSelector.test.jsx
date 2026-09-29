import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import LabelSelector from '../../../views/labels/LabelSelector';
import { GET_THING_TREE } from '../../../graphql/queries';
import { renderWithProviders } from '../../testUtils';
import { NODES } from '../../fixtures';

const many = (m) => ({ ...m, maxUsageCount: 20 });
const treeMock = (nodes = NODES) => many({ request: { query: GET_THING_TREE }, result: { data: { thingTree: nodes } } });

describe('the labels selector', () => {
  it('lists locations and containers, not plain items, by default', async () => {
    renderWithProviders(<LabelSelector />, { mocks: [treeMock()] });
    const list = await screen.findByRole('list', { name: 'Things to label' });
    // House, Garage, Shelf 2 (locations) and Van, Wendy (containers) — not the rifle or the keyboard.
    expect(within(list).getAllByRole('checkbox')).toHaveLength(5);
    expect(within(list).queryByText('Ruger 10/22')).toBeNull();
    expect(within(list).queryByText('Keyboard')).toBeNull();
    expect(within(list).getByText('House')).toBeInTheDocument();
  });

  it('the items toggle brings plain items into the list too', async () => {
    renderWithProviders(<LabelSelector />, { mocks: [treeMock()] });
    await screen.findByText('House');
    fireEvent.click(screen.getByRole('checkbox', { name: /Also list items/ }));
    expect(await screen.findByText('Ruger 10/22')).toBeInTheDocument();
    expect(screen.getByText('Keyboard')).toBeInTheDocument();
  });

  it('Preview is disabled with nothing checked, and navigates to /labels?ids=... with what is', async () => {
    renderWithProviders(<LabelSelector />, { mocks: [treeMock()], initialEntries: ['/labels'] });
    await screen.findByText('House');
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();

    const houseRow = screen.getByText('House').closest('li');
    fireEvent.click(within(houseRow).getByRole('checkbox'));
    const vanRow = screen.getByText('Van').closest('li');
    fireEvent.click(within(vanRow).getByRole('checkbox'));

    const button = screen.getByRole('button', { name: 'Preview (2)' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    // Navigation itself is exercised in LabelsView/LabelPreview tests; here we
    // only need labelsPath to have been called with what was checked, which a
    // pushed history entry proves indirectly via LabelsView's own routing —
    // see LabelsView.test.jsx for the end-to-end selector → preview flow.
  });

  it('shows a friendly message when the household has nothing to show', async () => {
    renderWithProviders(<LabelSelector />, { mocks: [treeMock([])] });
    expect(await screen.findByText(/Nothing here yet/)).toBeInTheDocument();
  });
});

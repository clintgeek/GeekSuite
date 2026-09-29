import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import LabelsView from '../../views/LabelsView';
import { GET_THING_TREE } from '../../graphql/queries';
import { GET_LABEL_THING } from '../../graphql/labelQueries';
import { renderWithProviders } from '../testUtils';
import { NODES, makeThing } from '../fixtures';

const toStringMock = vi.fn();
vi.mock('qrcode', () => ({
  default: { toString: (...args) => toStringMock(...args) },
}));

beforeEach(() => {
  toStringMock.mockReset();
  toStringMock.mockImplementation((value) => Promise.resolve(`<svg data-value="${value}"></svg>`));
});

const many = (m) => ({ ...m, maxUsageCount: 20 });

describe('/labels', () => {
  it('with no ?ids=, shows the selector', async () => {
    renderWithProviders(<LabelsView />, {
      initialEntries: ['/labels'],
      mocks: [many({ request: { query: GET_THING_TREE }, result: { data: { thingTree: NODES } } })],
    });
    expect(await screen.findByText('Print labels')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Things to label' })).toBeInTheDocument();
  });

  it('checking things and hitting Preview lands on the preview for exactly those ids', async () => {
    renderWithProviders(<LabelsView />, {
      initialEntries: ['/labels'],
      mocks: [
        many({ request: { query: GET_THING_TREE }, result: { data: { thingTree: NODES } } }),
        { request: { query: GET_LABEL_THING, variables: { id: 'n-house' } }, result: { data: { thing: makeThing({ id: 'n-house', name: 'House', path: [] }) } } },
      ],
    });

    await screen.findByText('House');
    const houseRow = screen.getByText('House').closest('li');
    fireEvent.click(within(houseRow).getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Preview (1)' }));

    // The selector is gone, replaced by the preview for n-house alone.
    expect(await screen.findByTestId('label-sticker')).toHaveAttribute('data-thing-id', 'n-house');
    expect(screen.queryByRole('list', { name: 'Things to label' })).toBeNull();
  });

  it('with ?ids= already set, shows the preview directly', async () => {
    renderWithProviders(<LabelsView />, {
      initialEntries: ['/labels?ids=t-wendy'],
      mocks: [{ request: { query: GET_LABEL_THING, variables: { id: 't-wendy' } }, result: { data: { thing: makeThing({ id: 't-wendy' }) } } }],
    });
    expect(await screen.findByTestId('label-sticker')).toHaveAttribute('data-thing-id', 't-wendy');
  });
});

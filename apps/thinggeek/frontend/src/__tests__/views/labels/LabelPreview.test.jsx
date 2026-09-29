import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import LabelPreview from '../../../views/labels/LabelPreview';
import { GET_LABEL_THING } from '../../../graphql/labelQueries';
import { renderWithProviders } from '../../testUtils';
import { makeThing, makeRifle } from '../../fixtures';

const toStringMock = vi.fn();
vi.mock('qrcode', () => ({
  default: { toString: (...args) => toStringMock(...args) },
}));

beforeEach(() => {
  toStringMock.mockReset();
  toStringMock.mockImplementation((value) => Promise.resolve(`<svg data-value="${value}"></svg>`));
});

const thingMock = (id, thing) => ({ request: { query: GET_LABEL_THING, variables: { id } }, result: { data: { thing } } });

describe('the labels preview', () => {
  it('renders one sticker per found thing, and a note for anything missing', async () => {
    const mocks = [
      thingMock('t-wendy', makeThing({ id: 't-wendy' })),
      thingMock('t-rifle', makeRifle({ id: 't-rifle' })),
      thingMock('t-gone', null),
    ];
    renderWithProviders(<LabelPreview ids={['t-wendy', 't-rifle', 't-gone']} />, { mocks });

    const stickers = await screen.findAllByTestId('label-sticker');
    expect(stickers).toHaveLength(2);
    expect(screen.getByTestId('labels-missing-note')).toHaveTextContent("1 thing couldn't be found");
  });

  it('a friendly note, not a crash, when every id is missing', async () => {
    const mocks = [thingMock('t-gone-1', null), thingMock('t-gone-2', null)];
    renderWithProviders(<LabelPreview ids={['t-gone-1', 't-gone-2']} />, { mocks });

    expect(await screen.findByText('Nothing to print — every id in the link was missing.')).toBeInTheDocument();
    expect(screen.getByTestId('labels-missing-note')).toHaveTextContent('2 things');
    expect(screen.queryByTestId('label-sticker')).toBeNull();
  });

  it('a query that errors outright is folded into "missing" too, not a crash', async () => {
    const mocks = [{ request: { query: GET_LABEL_THING, variables: { id: 't-bad' } }, error: new Error('boom') }];
    renderWithProviders(<LabelPreview ids={['t-bad']} />, { mocks });
    expect(await screen.findByText('Nothing to print — every id in the link was missing.')).toBeInTheDocument();
  });

  it('switching size re-renders the same things at the new size', async () => {
    const mocks = [thingMock('t-wendy', makeThing({ id: 't-wendy' }))];
    renderWithProviders(<LabelPreview ids={['t-wendy']} />, { mocks });

    const sticker = await screen.findByTestId('label-sticker');
    expect(sticker).toHaveAttribute('data-size', 'small');

    fireEvent.click(screen.getByRole('button', { name: /Large/ }));
    await waitFor(() => expect(screen.getByTestId('label-sticker')).toHaveAttribute('data-size', 'large'));
  });

  it('Print calls window.print()', async () => {
    const mocks = [thingMock('t-wendy', makeThing({ id: 't-wendy' }))];
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithProviders(<LabelPreview ids={['t-wendy']} />, { mocks });

    await screen.findByTestId('label-sticker');
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('the print portal renders its own copy, distinctly tagged, so on-screen queries never see two', async () => {
    // The print portal is always mounted once ready (hidden only by the
    // `@media print` CSS, never removed from the DOM), so its stickers use a
    // `print-label-*` prefix instead of reusing `label-*` — see
    // LabelSticker.jsx. Without that, `getByTestId('label-sticker')` throws
    // "Found multiple elements" the moment both trees are settled (it can
    // look fine on first mount purely by a render/effect timing accident,
    // then fail the moment anything re-renders — see switching-size above).
    const mocks = [thingMock('t-wendy', makeThing({ id: 't-wendy' }))];
    renderWithProviders(<LabelPreview ids={['t-wendy']} />, { mocks });

    await screen.findByTestId('label-sticker');
    await waitFor(() => expect(screen.getByTestId('label-print-sheet')).toBeInTheDocument());
    // Exactly one of each, under distinct testids — not two of the same one.
    expect(screen.getAllByTestId('label-sticker')).toHaveLength(1);
    expect(screen.getAllByTestId('print-label-sticker')).toHaveLength(1);
  });
});

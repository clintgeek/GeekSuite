import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import ThingCard from '../../components/ThingCard';
import ThingRow from '../../components/ThingRow';
import { renderWithProviders } from '../testUtils';
import { date, makeThing } from '../fixtures';

describe('ThingCard', () => {
  it('names the thing, what and where it is, and a close due date', () => {
    const onOpen = vi.fn();
    const thing = makeThing();
    renderWithProviders(<ThingCard thing={thing} onOpen={onOpen} />);
    const card = screen.getByRole('button', { name: 'Wendy, Boat · Garage › Shelf 2' });
    expect(within(card).getByRole('heading', { name: 'Wendy' })).toBeInTheDocument();
    expect(within(card).getByText('Boat · Garage › Shelf 2')).toBeInTheDocument();
    expect(screen.getByTestId('due-line')).toHaveTextContent('Due in 12 days · Registration');
    expect(screen.getByText('fishing')).toBeInTheDocument();
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith(thing);
  });

  it('says nothing about a date that is not close', () => {
    renderWithProviders(<ThingCard thing={makeThing({ nextDue: date({ status: 'later', daysUntil: 200 }) })} />);
    expect(screen.queryByTestId('due-line')).toBeNull();
  });

  it('draws the type plate when there is no photo, the cover when there is', () => {
    const { container, rerender } = renderWithProviders(<ThingCard thing={makeThing()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg[data-testid="DirectionsBoatIcon"]')).not.toBeNull();
    rerender(<ThingCard thing={makeThing({ coverPhoto: { __typename: 'ThingPhoto', id: 'p1', role: 'overview', url: '/api/files/f1', thumbUrl: '/api/files/f1/thumb' } })} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/files/f1/thumb');
  });
});

describe('ThingRow', () => {
  it('shows value and next due in their columns', () => {
    renderWithProviders(
      <ul>
        <ThingRow thing={makeThing()} />
      </ul>
    );
    expect(screen.getAllByText('$18,500').length).toBeGreaterThan(0);
    expect(screen.getByText('Oct 7, 2026')).toBeInTheDocument();
  });

  it('dashes for a thing with neither', () => {
    renderWithProviders(
      <ul>
        <ThingRow thing={makeThing({ nextDue: null, value: { __typename: 'ThingValue', amount: null, currency: 'USD', asOf: null } })} />
      </ul>
    );
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});

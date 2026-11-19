/**
 * The Attention page on a phone: a due row never cuts off its date, and the
 * place has a line of its own.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { DueRow } from '../../views/AttentionView';
import { renderWithProviders } from '../testUtils';
import { date, makeThing } from '../fixtures';

describe('a due row', () => {
  it('the label and date may wrap (never truncate), and the place is its own line', () => {
    const thing = makeThing({ name: 'Wendy', nextDue: date({ label: 'Boat registration renewal with the state', daysUntil: 12 }) });
    renderWithProviders(
      <ul>
        <DueRow thing={thing} />
      </ul>
    );
    const when = screen.getByTestId('due-when');
    expect(when).toHaveTextContent('Boat registration renewal with the state · Oct 7, 2026');
    expect(window.getComputedStyle(when).whiteSpace).not.toBe('nowrap');
    expect(window.getComputedStyle(when).textOverflow).not.toBe('ellipsis');
    // The place is not tacked onto the date's line.
    expect(when).not.toHaveTextContent('Garage');
    expect(screen.getByTestId('due-where')).toHaveTextContent('Garage');
  });
});

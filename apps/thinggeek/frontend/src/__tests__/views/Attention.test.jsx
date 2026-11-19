/**
 * The Attention page on a phone: a due row never cuts off its date, and the
 * place has a line of its own.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { DueRow, GAP_CARDS, RecordCheckList } from '../../views/AttentionView';
import { Stat } from '../../views/InsuranceView';
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

describe('statuses do not look like checkboxes you can tick', () => {
  it('Record check: an open gap leads with the stripe, a closed one with a check plate — never a square', () => {
    const gaps = GAP_CARDS.map((g, i) => ({ ...g, count: i === 0 ? 0 : 12 }));
    renderWithProviders(<RecordCheckList gaps={gaps} />);
    expect(screen.queryAllByTestId('check-square')).toHaveLength(0);
    const open = screen.getByTestId('gap-receipt');
    expect(within(open).getByTestId('stripe-mark')).toBeInTheDocument();
    const closed = screen.getByTestId(`gap-${GAP_CARDS[0].key}`);
    expect(within(closed).getByTestId('status-pip')).toHaveAttribute('data-done', 'true');
  });

  it('Insurance: "Photo 11 of 16" is a dial filled to 69%, not an empty box; 16 of 16 is a check plate', () => {
    renderWithProviders(
      <>
        <Stat label="Photo" value="11 of 16" sub="have at least one" done={false} fraction={11 / 16} />
        <Stat label="Receipt" value="16 of 16" sub="on file" done fraction={1} />
      </>
    );
    expect(screen.queryAllByTestId('check-square')).toHaveLength(0);
    const [photo, receipt] = screen.getAllByTestId('status-pip');
    expect(photo).toHaveAttribute('data-percent', '69');
    expect(photo).toHaveAttribute('data-done', 'false');
    expect(receipt).toHaveAttribute('data-done', 'true');
  });
});

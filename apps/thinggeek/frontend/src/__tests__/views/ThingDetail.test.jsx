import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within, waitFor } from '@testing-library/react';
import { ThingDetailBody } from '../../views/detail/ThingDetail';
import ReadinessPanel from '../../views/detail/ReadinessPanel';
import { renderWithProviders } from '../testUtils';
import { date, makeRifle, makeThing, typeRef } from '../fixtures';

const body = (thing, props = {}) => <ThingDetailBody thing={thing} onPanel={() => {}} onFix={() => {}} uploads={[]} onRetry={() => {}} {...props} />;

const hullRow = () => screen.getByTestId('field-hullNumber');

describe('identifier masking', () => {
  it('shows only the last four, never the whole serial, until revealed', () => {
    renderWithProviders(body(makeThing()));
    const value = within(hullRow()).getByTestId('identifier-value');
    expect(value).toHaveTextContent('••••4567');
    expect(value).toHaveAttribute('data-masked', 'true');
    expect(screen.queryByText('ABC1234567')).toBeNull();
    expect(document.body.textContent).not.toContain('ABC1234567');
    // a non-identifier field is plain
    expect(within(screen.getByTestId('field-manufacturer')).getByText('Tracker')).toBeInTheDocument();
    expect(within(screen.getByTestId('field-lengthFt')).getByText('18 ft')).toBeInTheDocument();
  });

  it('Reveal shows it, pressing again hides it', () => {
    renderWithProviders(body(makeThing()));
    const reveal = screen.getByRole('button', { name: 'Reveal Hull number' });
    expect(reveal).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(reveal);
    expect(within(hullRow()).getByTestId('identifier-value')).toHaveTextContent('ABC1234567');
    const hide = screen.getByRole('button', { name: 'Hide Hull number' });
    expect(hide).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(hide);
    expect(within(hullRow()).getByTestId('identifier-value')).toHaveTextContent('••••4567');
  });

  it('re-masks after moving to another thing and back', () => {
    const wendy = makeThing();
    const { rerender } = renderWithProviders(body(wendy));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal Hull number' }));
    expect(screen.getByText('ABC1234567')).toBeInTheDocument();
    rerender(body(makeRifle()));
    expect(within(screen.getByTestId('field-serial')).getByTestId('identifier-value')).toHaveTextContent('••••6543');
    rerender(body(wendy));
    expect(within(hullRow()).getByTestId('identifier-value')).toHaveTextContent('••••4567');
    expect(screen.queryByText('ABC1234567')).toBeNull();
  });

  it('Copy copies the real value without revealing it', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderWithProviders(body(makeThing()));
    fireEvent.click(screen.getByRole('button', { name: 'Copy Hull number' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ABC1234567'));
    expect(within(hullRow()).getByTestId('identifier-value')).toHaveAttribute('data-masked', 'true');
    expect(await screen.findByText('Hull number copied.')).toBeInTheDocument();
    writeText.mockRestore();
  });
});

describe('relationships read as sentences from both ends', () => {
  it('the boat: "Equipped with"', () => {
    renderWithProviders(body(makeThing()));
    const group = screen.getByTestId('relationship-group');
    expect(within(group).getByText('Equipped with:')).toBeInTheDocument();
    expect(within(group).getByRole('link', { name: 'Garmin Striker 4' })).toHaveAttribute('href', '/thing/t-garmin');
  });

  it('the fish finder: "Equipped on"', () => {
    const finder = makeThing({
      id: 't-garmin',
      name: 'Garmin Striker 4',
      type: typeRef('ty-general'),
      fields: [],
      relationships: [
        { __typename: 'ThingRelationship', id: 'r1-in', kind: 'equipped-with', direction: 'in', thing: { __typename: 'ThingSummary', id: 't-wendy', name: 'Wendy', coverThumbUrl: null, type: { __typename: 'ThingType', id: 'ty-boat', name: 'Boat', icon: 'DirectionsBoat' } } },
      ],
    });
    renderWithProviders(body(finder));
    const group = screen.getByTestId('relationship-group');
    expect(within(group).getByText('Equipped on:')).toBeInTheDocument();
    expect(within(group).getByRole('link', { name: 'Wendy' })).toBeInTheDocument();
    expect(screen.queryByText('Equipped with:')).toBeNull();
  });
});

describe('dates timeline', () => {
  it('shows status and the next occurrence of a recurring date', () => {
    const thing = makeThing({
      dates: [
        date({ id: 'd-over', kind: 'insurance', daysUntil: -3, status: 'overdue', date: '2026-09-22T00:00:00.000Z', occursOn: '2026-09-22T00:00:00.000Z' }),
        date({ id: 'd-rec', kind: 'registration', label: 'Boat registration', recurEveryMonths: 12, date: '2020-03-03T00:00:00.000Z', occursOn: '2027-03-03T00:00:00.000Z', daysUntil: 159, status: 'later' }),
      ],
    });
    renderWithProviders(body(thing));
    const rows = screen.getAllByTestId('date-row');
    const overdue = rows.find((r) => r.getAttribute('data-status') === 'overdue');
    expect(overdue).toHaveTextContent('Insurance');
    expect(overdue).toHaveTextContent('3 days overdue');
    const recurring = rows.find((r) => r.getAttribute('data-status') === 'later');
    expect(recurring).toHaveTextContent('Boat registration');
    expect(recurring).toHaveTextContent('Mar 3, 2027'); // occursOn, the due date
    expect(recurring).toHaveTextContent('Every year, counting from Mar 3, 2020');
    // overdue sorts first
    expect(rows[0]).toBe(overdue);
  });
});

describe('claim readiness', () => {
  it('a keyboard has no ID plate or serial to miss', () => {
    const kb = makeThing({ type: typeRef('ty-keyboard'), fields: [{ __typename: 'ThingAttribute', key: 'switches', label: 'Switches', kind: 'text', unit: null, identifier: false, value: 'Brown' }], missing: ['photo', 'value'] });
    const onFix = vi.fn();
    renderWithProviders(<ReadinessPanel thing={kb} onFix={onFix} />);
    const panel = screen.getByTestId('readiness');
    expect(panel).toHaveTextContent('1 of 3 on file');
    expect(screen.queryByTestId('fix-id-plate')).toBeNull();
    expect(screen.queryByTestId('fix-serial')).toBeNull();
    fireEvent.click(screen.getByTestId('fix-photo'));
    expect(onFix).toHaveBeenCalledWith('photo');
  });

  it('a boat missing its ID plate and serial offers both fixes', () => {
    const onFix = vi.fn();
    renderWithProviders(<ReadinessPanel thing={makeThing({ missing: ['id-plate', 'serial'] })} onFix={onFix} />);
    expect(screen.getByTestId('readiness')).toHaveTextContent('3 of 5 on file');
    fireEvent.click(screen.getByRole('button', { name: /Add an ID-plate photo/ }));
    fireEvent.click(screen.getByRole('button', { name: /Record the serial/ }));
    expect(onFix.mock.calls).toEqual([['id-plate'], ['serial']]);
  });

  it('says so when everything is on file', () => {
    renderWithProviders(<ReadinessPanel thing={makeThing({ missing: [] })} onFix={() => {}} />);
    expect(screen.getByText('Everything an insurer asks for is on file.')).toBeInTheDocument();
  });

  it('the detail action bar and fix buttons route through onPanel/onFix', () => {
    const onPanel = vi.fn();
    const onFix = vi.fn();
    renderWithProviders(body(makeThing(), { onPanel, onFix }));
    fireEvent.click(within(screen.getByTestId('detail-actions')).getByRole('button', { name: 'Add photo' }));
    fireEvent.click(screen.getByTestId('fix-receipt'));
    expect(onPanel).toHaveBeenCalledWith('photo');
    expect(onFix).toHaveBeenCalledWith('receipt');
  });
});

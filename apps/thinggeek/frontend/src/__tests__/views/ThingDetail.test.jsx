import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within, waitFor } from '@testing-library/react';
import { ThingDetailBody } from '../../views/detail/ThingDetail';
import ReadinessPanel from '../../views/detail/ReadinessPanel';
import { renderWithProviders } from '../testUtils';
import { crumbs, date, makeRifle, makeThing, typeRef } from '../fixtures';

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

describe('accessories read as sentences from both ends', () => {
  it('the boat: "Accessories"', () => {
    renderWithProviders(body(makeThing()));
    const group = screen.getByTestId('relationship-group');
    expect(within(group).getByText('Accessories:')).toBeInTheDocument();
    expect(within(group).getByRole('link', { name: 'Garmin Striker 4' })).toHaveAttribute('href', '/thing/t-garmin');
  });

  it('the fish finder: "Accessory for"', () => {
    const finder = makeThing({
      id: 't-garmin',
      name: 'Garmin Striker 4',
      type: typeRef('ty-general'),
      kind: 'item',
      fields: [],
      relationships: [
        { __typename: 'ThingRelationship', id: 'r1', kind: 'accessory-of', direction: 'out', thing: { __typename: 'ThingSummary', id: 't-wendy', name: 'Wendy', coverThumbUrl: null, type: { __typename: 'ThingType', id: 'ty-boat', name: 'Boat', icon: 'DirectionsBoat' } } },
      ],
    });
    renderWithProviders(body(finder));
    const group = screen.getByTestId('relationship-group');
    expect(within(group).getByText('Accessory for:')).toBeInTheDocument();
    expect(within(group).getByRole('link', { name: 'Wendy' })).toBeInTheDocument();
    expect(screen.queryByText('Accessories:')).toBeNull();
  });
});

describe('where it is', () => {
  const cables = () =>
    makeThing({ id: 't-cables', name: 'Jumper cables', type: typeRef('ty-tool'), kind: 'item', parentId: 'n-van', path: crumbs('n-house', 'n-garage', 'n-van'), fields: [], relationships: [] });

  it('a breadcrumb, root → parent, each crumb a link to that thing, with Move to…', () => {
    const onPanel = vi.fn();
    renderWithProviders(body(cables(), { onPanel }));
    const crumbsNav = screen.getByRole('navigation', { name: 'Where it is' });
    expect(within(crumbsNav).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['House', '/thing/n-house'],
      ['Garage', '/thing/n-garage'],
      ['Van', '/thing/n-van'],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    expect(onPanel).toHaveBeenCalledWith('move');
  });

  it('inside something in the Trash: that crumb is not a link, and the page says so', () => {
    const path = crumbs('n-house', 'n-garage', 'n-van');
    path[2] = { ...path[2], inTrash: true };
    renderWithProviders(body({ ...cables(), path }));
    const crumbsNav = screen.getByRole('navigation', { name: 'Where it is' });
    expect(within(crumbsNav).getAllByRole('link').map((a) => a.textContent)).toEqual(['House', 'Garage']);
    expect(within(crumbsNav).getByText('Van (in the Trash)')).toBeInTheDocument();
    expect(screen.getByTestId('inside-trash')).toHaveTextContent('inside something in the Trash');
  });

  it('a container lists what it contains, each a link, with Add here', () => {
    const van = makeThing({
      id: 'n-van', name: 'Van', type: typeRef('ty-vehicle'), kind: 'container', fields: [], relationships: [], contentsCount: 1,
      contents: [makeThing({ id: 't-cables', name: 'Jumper cables', type: typeRef('ty-tool'), kind: 'item' })],
    });
    renderWithProviders(body(van));
    const section = screen.getByRole('region', { name: 'Contains · 1' });
    expect(within(section).getByRole('link', { name: /Jumper cables/ })).toHaveAttribute('href', '/thing/t-cables');
    expect(within(section).getByRole('button', { name: 'Add here' })).toBeInTheDocument();
  });

  it('an empty item has no Contains section; a location always does', () => {
    renderWithProviders(body(cables()));
    expect(screen.queryByTestId('add-here')).toBeNull();
  });

  it('a location says it is empty', () => {
    renderWithProviders(body(makeThing({ id: 'n-shelf', name: 'Shelf 2', type: typeRef('ty-location'), kind: 'location', fields: [], relationships: [] })));
    expect(screen.getByRole('region', { name: 'Contains' })).toHaveTextContent('Nothing inside yet.');
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

import { describe, expect, it } from 'vitest';
import { activeChips, SECTIONS, valueLabel, valueRangeLabel } from '../../utils/facets';
import { readLibraryState } from '../../utils/libraryFilter';
import { PLACES, TYPES } from '../fixtures';
import { placeOrder } from '../../utils/places';

const context = {
  typesById: new Map(TYPES.map((t) => [t.id, t])),
  placesById: new Map(PLACES.map((p) => [p.id, p])),
  placeOrder: placeOrder(PLACES),
};

describe('facet config', () => {
  it('labels types and places from the household data', () => {
    expect(valueLabel('types', 'ty-boat', context)).toBe('Boat');
    expect(valueLabel('places', 'pl-shelf', context)).toBe('Garage › Shelf 2');
    expect(valueLabel('places', 'nope', context)).toBe('Unknown place');
    expect(valueLabel('due', '30d')).toBe('Next 30 days');
    expect(valueLabel('missing', 'id-plate')).toBe('No ID-plate photo');
  });

  it('places are in tree order', () => {
    const place = SECTIONS.find((s) => s.id === 'place');
    expect(place.fixed(context)).toEqual(['pl-house', 'pl-garage', 'pl-shelf', 'pl-truck']);
  });

  it('missing is a closed list of the five gaps', () => {
    const missing = SECTIONS.find((s) => s.id === 'missing');
    expect(missing.fixed).toEqual(['photo', 'id-plate', 'receipt', 'serial', 'value']);
    expect(missing.closedList).toBe(true);
  });

  it('value range reads in dollars', () => {
    expect(valueRangeLabel(500, 2000)).toBe('$500 – $2,000');
    expect(valueRangeLabel(500, null)).toBe('$500 or more');
    expect(valueRangeLabel(null, 2000)).toBe('Up to $2,000');
  });

  it('chips name what is on, each with the patch that removes it', () => {
    const state = readLibraryState(new URLSearchParams('?type=ty-boat&in=pl-shelf&value=500-2000&photos=0'));
    const chips = activeChips(state, context);
    expect(chips.map((c) => `${c.group}: ${c.label}`)).toEqual(['Type: Boat', 'In: Garage › Shelf 2', 'Photos: None', 'Value: $500 – $2,000']);
    expect(chips.find((c) => c.group === 'Value').patch).toEqual({ valueMin: null, valueMax: null });
  });
});

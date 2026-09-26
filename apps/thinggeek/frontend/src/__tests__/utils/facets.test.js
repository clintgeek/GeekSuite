import { describe, expect, it } from 'vitest';
import { activeChips, SECTIONS, valueLabel, valueRangeLabel } from '../../utils/facets';
import { readLibraryState } from '../../utils/libraryFilter';
import { NODES, TYPES } from '../fixtures';
import { whereOrder } from '../../utils/where';

const context = {
  typesById: new Map(TYPES.map((t) => [t.id, t])),
  nodesById: new Map(NODES.map((n) => [n.id, n])),
  whereOrder: whereOrder(NODES),
};

describe('facet config', () => {
  it('labels types and where from the household data', () => {
    expect(valueLabel('types', 'ty-boat', context)).toBe('Boat');
    expect(valueLabel('within', 'n-shelf', context)).toBe('Garage › Shelf 2');
    expect(valueLabel('within', 'n-van', context)).toBe('Garage › Van');
    expect(valueLabel('within', 'nope', context)).toBe('Unknown place');
    expect(valueLabel('kinds', 'location')).toBe('Locations');
    expect(valueLabel('due', '30d')).toBe('Next 30 days');
    expect(valueLabel('missing', 'id-plate')).toBe('No ID-plate photo');
  });

  it('Where lists locations and containers in tree order — never a plain item', () => {
    const where = SECTIONS.find((s) => s.id === 'where');
    expect(where.key).toBe('within');
    expect(where.fixed(context)).toEqual(['n-house', 'n-garage', 'n-shelf', 'n-van', 't-wendy']);
  });

  it('Kind is a closed list; picking Locations is how the library shows them', () => {
    const kind = SECTIONS.find((s) => s.id === 'kind');
    expect(kind.fixed).toEqual(['container', 'item', 'location']);
    expect(kind.closedList).toBe(true);
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
    const state = readLibraryState(new URLSearchParams('?type=ty-boat&in=n-shelf&kind=location&value=500-2000&photos=0'));
    const chips = activeChips(state, context);
    expect(chips.map((c) => `${c.group}: ${c.label}`)).toEqual(['Type: Boat', 'In: Garage › Shelf 2', 'Kind: Locations', 'Photos: None', 'Value: $500 – $2,000']);
    expect(chips.find((c) => c.group === 'Value').patch).toEqual({ valueMin: null, valueMax: null });
  });
});

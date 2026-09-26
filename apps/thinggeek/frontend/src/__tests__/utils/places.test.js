import { describe, expect, it } from 'vitest';
import { buildPlaceTree, deletePlaceSummary, flattenPlaceTree, placeLabel, shortPlaceLabel, subtreeIds } from '../../utils/places';
import { PLACES } from '../fixtures';

describe('place tree', () => {
  it('reads in tree order with depths, children by name', () => {
    const rows = flattenPlaceTree(buildPlaceTree(PLACES)).map((r) => [r.place.name, r.depth]);
    expect(rows).toEqual([['House', 0], ['Garage', 1], ['Shelf 2', 2], ['Truck', 0]]);
  });

  it('an orphan (missing parent) becomes a root', () => {
    const rows = flattenPlaceTree(buildPlaceTree([{ id: 'a', name: 'Attic', parentId: 'gone' }]));
    expect(rows).toEqual([{ place: expect.objectContaining({ id: 'a' }), depth: 0 }]);
  });

  it('labels from the path, or by walking parents', () => {
    const shelf = PLACES.find((p) => p.id === 'pl-shelf');
    expect(placeLabel(shelf)).toBe('House › Garage › Shelf 2');
    expect(shortPlaceLabel(shelf)).toBe('Garage › Shelf 2');
    const byId = new Map([['p', { id: 'p', name: 'Garage' }], ['c', { id: 'c', name: 'Bin', parentId: 'p' }]]);
    expect(placeLabel(byId.get('c'), byId)).toBe('Garage › Bin');
  });

  it('subtree is the place and every descendant', () => {
    expect([...subtreeIds(PLACES, 'pl-house')].sort()).toEqual(['pl-garage', 'pl-house', 'pl-shelf']);
    expect([...subtreeIds(PLACES, 'pl-truck')]).toEqual(['pl-truck']);
  });

  it('says what a delete does', () => {
    const garage = PLACES.find((p) => p.id === 'pl-garage');
    expect(deletePlaceSummary(garage, PLACES)).toBe('Shelf 2 moves up to House. The 2 things kept directly here become unplaced.');
    const house = PLACES.find((p) => p.id === 'pl-house');
    const houseText = deletePlaceSummary(house, PLACES);
    expect(houseText).toMatch(/^Garage moves up to the top level\. /);
    expect(houseText).toMatch(/The 1 thing kept directly here becomes? unplaced\./);
    const truck = PLACES.find((p) => p.id === 'pl-truck');
    expect(deletePlaceSummary(truck, PLACES)).toBe('Nothing is kept here, so nothing else changes.');
  });
});

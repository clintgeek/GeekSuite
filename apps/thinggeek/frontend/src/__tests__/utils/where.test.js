import { describe, expect, it } from 'vitest';
import { NODES, crumbs, makeThing } from '../fixtures';
import {
  buildTree,
  countsText,
  flattenTree,
  insideTrash,
  isParentKind,
  kindOf,
  nodeLabel,
  shortNodeLabel,
  shortWhereLabel,
  showsContents,
  subtreeIds,
  whereLabel,
  whereOrder,
} from '../../utils/where';

const byId = new Map(NODES.map((n) => [n.id, n]));

describe('the containment tree', () => {
  it('reads locations, then containers, then items, each by name', () => {
    const rows = flattenTree(buildTree(NODES)).map((r) => [r.node.name, r.depth]);
    expect(rows).toEqual([
      ['House', 0],
      ['Garage', 1],
      ['Shelf 2', 2],
      ['Van', 2],
      ['Jumper cables', 3],
      ['Wendy', 2],
      ['Ruger 10/22', 1],
      ['Keyboard', 0],
    ]);
  });

  it('a subset keeps its own shape; a node whose parent is left out becomes a root', () => {
    const rows = flattenTree(buildTree(NODES, (n) => isParentKind(kindOf(n)))).map((r) => [r.node.name, r.depth]);
    expect(rows).toEqual([
      ['House', 0],
      ['Garage', 1],
      ['Shelf 2', 2],
      ['Van', 2],
      ['Wendy', 2],
    ]);
    expect(flattenTree(buildTree([{ id: 'a', name: 'A', parentId: 'gone', kind: 'location' }]))).toEqual([{ node: expect.objectContaining({ id: 'a' }), depth: 0 }]);
  });

  it('the Where facet order is the locations and containers in tree order', () => {
    expect(whereOrder(NODES)).toEqual(['n-house', 'n-garage', 'n-shelf', 'n-van', 't-wendy']);
  });

  it('labels walk the parents', () => {
    const cables = byId.get('t-cables');
    expect(nodeLabel(cables, byId)).toBe('House › Garage › Van › Jumper cables');
    expect(shortNodeLabel(cables, byId)).toBe('Van › Jumper cables');
  });

  it('a subtree is the thing and everything inside it — what Move must refuse', () => {
    expect([...subtreeIds(NODES, 'n-garage')].sort()).toEqual(['n-garage', 'n-shelf', 'n-van', 't-cables', 't-wendy']);
    expect([...subtreeIds(NODES, 't-keyboard')]).toEqual(['t-keyboard']);
  });

  it('counts read naturally', () => {
    expect(countsText({ childCount: 3, itemCount: 4 })).toBe('4 things');
    expect(countsText({ childCount: 1, itemCount: 1 })).toBe('1 thing');
    expect(countsText({ childCount: 2, itemCount: 0 })).toBe('2 inside');
    expect(countsText({ childCount: 0, itemCount: 0 })).toBe('Empty');
  });
});

describe("a thing's own path", () => {
  it('full and short', () => {
    const cables = makeThing({ path: crumbs('n-house', 'n-garage', 'n-van') });
    expect(whereLabel(cables)).toBe('House › Garage › Van');
    expect(shortWhereLabel(cables)).toBe('Garage › Van');
    expect(whereLabel(makeThing({ path: [] }))).toBe('');
  });

  it('knows when something it is inside is in the Trash', () => {
    const path = crumbs('n-house', 'n-garage', 'n-van');
    expect(insideTrash(makeThing({ path }))).toBe(false);
    expect(insideTrash(makeThing({ path: [path[0], path[1], { ...path[2], inTrash: true }] }))).toBe(true);
  });

  it('Contains shows for locations and containers, and for an item only once it holds something', () => {
    expect(showsContents({ kind: 'location' })).toBe(true);
    expect(showsContents({ kind: 'container' })).toBe(true);
    expect(showsContents({ kind: 'item', contentsCount: 0 })).toBe(false);
    expect(showsContents({ kind: 'item', contentsCount: 1 })).toBe(true);
  });
});

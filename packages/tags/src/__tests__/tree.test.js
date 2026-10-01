import { describe, it, expect } from 'vitest';
import { tagTree, filterTagTree } from '../index.js';

// Ported from NoteGeek's __tests__/utils/tagTree.test.js.
const TAGS = ['dev', 'dev/frontend', 'dev/infra', 'finance', 'work/meetings'];
const NOTES = [
  { id: '1', tags: ['dev', 'dev/frontend'] },
  { id: '2', tags: ['dev/frontend'] },
  { id: '3', tags: ['dev/infra'] },
  { id: '4', tags: ['finance'] },
  { id: '5', tags: ['work/meetings'] },
];

const find = (nodes, path) => {
  for (const n of nodes) {
    if (n.path === path) return n;
    const hit = find(n.children, path);
    if (hit) return hit;
  }
  return null;
};

describe('tagTree', () => {
  it('nests paths and sorts by name', () => {
    const tree = tagTree(TAGS);
    expect(tree.map((n) => n.name)).toEqual(['dev', 'finance', 'work']);
    expect(find(tree, 'dev').children.map((n) => n.name)).toEqual(['frontend', 'infra']);
    // An intermediate segment that is not itself a tag still gets a node.
    expect(find(tree, 'work').children.map((n) => n.path)).toEqual(['work/meetings']);
  });

  it('item counts are distinct items under each node', () => {
    const tree = tagTree(TAGS, NOTES);
    expect(find(tree, 'dev').count).toBe(3); // note 1 counted once
    expect(find(tree, 'dev/frontend').count).toBe(2);
    expect(find(tree, 'work').count).toBe(1);
  });

  it('a counts map sums each node and its descendants', () => {
    const tree = tagTree(TAGS, { dev: 1, 'dev/frontend': 2, 'dev/infra': 4, finance: 3 });
    expect(find(tree, 'dev').count).toBe(7);
    expect(find(tree, 'dev/infra').count).toBe(4);
    expect(find(tree, 'work').count).toBe(0);
    const viaMap = tagTree(['a', 'a/b'], new Map([['a/b', 5]]));
    expect(find(viaMap, 'a').count).toBe(5);
  });

  it('without counts every count is null', () => {
    expect(find(tagTree(TAGS), 'dev').count).toBeNull();
  });

  it('ignores junk in the tag list', () => {
    expect(tagTree(['', '  ', null, 'a'])).toEqual([{ name: 'a', path: 'a', count: null, children: [] }]);
  });
});

describe('filterTagTree', () => {
  it('keeps matches and the ancestors that lead to them', () => {
    const tree = filterTagTree(tagTree(TAGS, NOTES), 'front');
    expect(tree.map((n) => n.path)).toEqual(['dev']);
    expect(tree[0].children.map((n) => n.path)).toEqual(['dev/frontend']);
  });
  it('an empty query is the whole tree', () => {
    const tree = tagTree(TAGS);
    expect(filterTagTree(tree, '  ')).toBe(tree);
  });
});

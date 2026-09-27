import { describe, it, expect } from 'vitest';
import { buildTagTree, filterTagTree } from '../../utils/tagTree';

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

describe('buildTagTree', () => {
  it('nests paths and sorts by name', () => {
    const tree = buildTagTree(TAGS, null);
    expect(tree.map((n) => n.name)).toEqual(['dev', 'finance', 'work']);
    expect(find(tree, 'dev').children.map((n) => n.name)).toEqual(['frontend', 'infra']);
    // An intermediate segment that is not itself a tag still gets a node.
    expect(find(tree, 'work').children.map((n) => n.path)).toEqual(['work/meetings']);
  });

  it('counts distinct notes under each node, parents included', () => {
    const tree = buildTagTree(TAGS, NOTES);
    // Note 1 carries both dev and dev/frontend: counted ONCE for dev.
    expect(find(tree, 'dev').count).toBe(3);
    expect(find(tree, 'dev/frontend').count).toBe(2);
    expect(find(tree, 'dev/infra').count).toBe(1);
    expect(find(tree, 'finance').count).toBe(1);
    expect(find(tree, 'work').count).toBe(1);
  });

  it('leaves counts null when the notes have not arrived', () => {
    expect(find(buildTagTree(TAGS, null), 'dev').count).toBeNull();
  });
});

describe('filterTagTree', () => {
  it('keeps matches in place, with the ancestors that lead to them', () => {
    const tree = filterTagTree(buildTagTree(TAGS, NOTES), 'front');
    expect(tree.map((n) => n.path)).toEqual(['dev']);
    expect(tree[0].children.map((n) => n.path)).toEqual(['dev/frontend']);
  });

  it('returns the tree untouched for an empty query', () => {
    const tree = buildTagTree(TAGS, NOTES);
    expect(filterTagTree(tree, '  ')).toBe(tree);
  });
});

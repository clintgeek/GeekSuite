import { describe, expect, it } from 'vitest';
import { groupRelationships, relationshipSentence } from '../../utils/relationships';

const t = (id, name) => ({ id, name });

describe('relationships as sentences', () => {
  it('accessory-of reads from each end', () => {
    const groups = groupRelationships([
      { id: '1', kind: 'accessory-of', direction: 'in', thing: t('l', '50mm lens') },
      { id: '2', kind: 'accessory-of', direction: 'in', thing: t('b', 'Spare battery') },
      { id: '3', kind: 'accessory-of', direction: 'out', thing: t('k', 'Camera bag') },
    ]);
    expect(groups.map((g) => g.phrase)).toEqual(['Accessory for', 'Accessories']);
    expect(relationshipSentence(groups[0])).toBe('Accessory for: Camera bag');
    expect(relationshipSentence(groups[1])).toBe('Accessories: 50mm lens and Spare battery');
  });

  it('dedupes one thing listed twice in the same sentence', () => {
    const groups = groupRelationships([
      { id: '1', kind: 'accessory-of', direction: 'in', thing: t('a', 'Lens') },
      { id: '2', kind: 'accessory-of', direction: 'in', thing: t('a', 'Lens') },
    ]);
    expect(groups).toHaveLength(1);
    expect(relationshipSentence(groups[0])).toBe('Accessories: Lens');
  });
});

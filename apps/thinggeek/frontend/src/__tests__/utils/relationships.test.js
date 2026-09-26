import { describe, expect, it } from 'vitest';
import { groupRelationships, relationshipSentence } from '../../utils/relationships';

const t = (id, name) => ({ id, name });

describe('relationships as sentences', () => {
  it('reads each kind from each end', () => {
    const groups = groupRelationships([
      { id: '1', kind: 'equipped-with', direction: 'out', thing: t('g', 'Garmin Striker 4') },
      { id: '2', kind: 'equipped-with', direction: 'out', thing: t('m', 'Minn Kota Endura') },
      { id: '3', kind: 'equipped-with', direction: 'in', thing: t('w', 'Wendy') },
      { id: '4', kind: 'part-of', direction: 'out', thing: t('k', 'Fishing kit') },
    ]);
    expect(groups.map((g) => g.phrase)).toEqual(['Equipped with', 'Equipped on', 'Part of']);
    expect(relationshipSentence(groups[0])).toBe('Equipped with: Garmin Striker 4 and Minn Kota Endura');
    expect(relationshipSentence(groups[1])).toBe('Equipped on: Wendy');
  });

  it('stored-with is one sentence both ways, deduped', () => {
    const groups = groupRelationships([
      { id: '1', kind: 'stored-with', direction: 'out', thing: t('a', 'Tackle box') },
      { id: '2', kind: 'stored-with', direction: 'in', thing: t('b', 'Rod case') },
      { id: '3', kind: 'stored-with', direction: 'in', thing: t('a', 'Tackle box') },
    ]);
    expect(groups).toHaveLength(1);
    expect(relationshipSentence(groups[0])).toBe('Stored with: Tackle box and Rod case');
  });
});

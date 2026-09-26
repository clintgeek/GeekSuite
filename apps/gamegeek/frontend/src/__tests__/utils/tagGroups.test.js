import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { groupOptions } from '@geeksuite/collection';
import { TAG_GROUPS, TAG_GROUP_ORDER, USER_TAG_GROUP, tagGroupOf } from '../../utils/tagGroups';

const require = createRequire(import.meta.url);

describe('tag groups', () => {
  it('mirror the server vocabulary exactly (packages/schemas/gamegeek/tags.js)', () => {
    const server = require('../../../../../../packages/schemas/gamegeek/tags.js');
    expect(TAG_GROUPS).toEqual(JSON.parse(JSON.stringify(server.TAG_GROUPS)));
  });

  it('put unknown tags under “Your tags”, case-insensitively matching known ones', () => {
    expect(tagGroupOf('cozy')).toBe('Story & mood');
    expect(tagGroupOf('Couch night')).toBe(USER_TAG_GROUP);
    // The Tags section's grouping is the shared groupOptions over these two.
    const groups = groupOptions([{ value: 'Pixel Art' }, { value: 'Game Pass' }, { value: 'Roguelike' }], tagGroupOf, TAG_GROUP_ORDER);
    expect(groups.map((g) => g.group)).toEqual(['Gameplay', 'Look & view', USER_TAG_GROUP]);
  });
});

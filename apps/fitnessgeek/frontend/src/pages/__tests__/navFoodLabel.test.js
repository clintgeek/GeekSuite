/**
 * "Find a food" read as the way to log one; the way to log one is the add
 * sheet ("Tell me what you ate"). The sidebar, the More page and the page
 * title all read the label from navConfig, so it changes there.
 */
import { describe, it, expect } from 'vitest';
import { navSectionsFor, moreGroupsFor } from '../../components/Layout/navConfig.jsx';

const searchItems = (sections) => sections.flatMap((s) => s.items).filter((i) => i.to === '/food-search');

describe('the food search page label', () => {
  it.each(['simple', 'full'])('reads "Look up a specific food" in the %s sidebar and More', (mode) => {
    const items = [...searchItems(navSectionsFor(mode)), ...searchItems(moreGroupsFor(mode))];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item.label).toBe('Look up a specific food');
  });
});

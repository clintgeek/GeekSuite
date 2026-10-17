/**
 * UX review 2026-10-17, IA-8 and IA-9, plus Chef's call to fold Profile into
 * Settings:
 *   - the Home tab's top-bar title is "Home", the same word as the tab;
 *   - Simple's "Everything else" is ordered for Heather (My meals, My foods,
 *     a specific food, Reports, then the rest) and says what a page needs
 *     before she taps into a dead end;
 *   - Profile has no row of its own anywhere (/profile redirects to Settings).
 */
import { describe, it, expect } from 'vitest';
import { navSectionsFor, moreGroupsFor, pageTitle } from '../../components/Layout/navConfig.jsx';

const items = (sections) => sections.flatMap((s) => s.items);

describe('the Home tab title (IA-8)', () => {
  it('reads "Home", not "Today"', () => {
    expect(pageTitle('/dashboard')).toBe('Home');
  });

  it('the other titles are unchanged', () => {
    expect(pageTitle('/food-log')).toBe('Food log');
    expect(pageTitle('/more')).toBe('More');
    expect(pageTitle('/settings')).toBe('Settings');
  });
});

describe("Simple's Everything else (IA-9)", () => {
  const rest = () => moreGroupsFor('simple').find((g) => g.label === 'Everything else').items;

  it('leads with what she uses: My meals, My foods, a specific food, Reports', () => {
    expect(rest().slice(0, 4).map((i) => i.label)).toEqual(['My meals', 'My foods', 'Look up a specific food', 'Reports']);
  });

  it('says what each dependent page needs', () => {
    const byLabel = Object.fromEntries(rest().map((i) => [i.label, i.description]));
    expect(byLabel.Activity).toBe('Steps and sleep — needs a Garmin watch');
    expect(byLabel['Import a scan']).toBe('Body-composition scans — needs the smart scale');
    expect(byLabel['Health dashboard']).toMatch(/needs setup$/);
  });

  it('nothing is dropped: every Full More destination is still on Simple More', () => {
    const simple = new Set(items(moreGroupsFor('simple')).map((i) => i.to));
    for (const item of items(moreGroupsFor('full'))) expect(simple.has(item.to)).toBe(true);
  });

  it("Full keeps its own descriptions", () => {
    const activity = items(moreGroupsFor('full')).find((i) => i.to === '/activity');
    expect(activity.description).toBe('Steps, workouts and sleep from Garmin');
  });
});

describe('Profile folds into Settings', () => {
  it.each(['simple', 'full'])('has no row in the %s sidebar or More', (mode) => {
    const all = [...items(navSectionsFor(mode)), ...items(moreGroupsFor(mode))];
    expect(all.find((i) => i.to === '/profile' || i.label === 'Profile')).toBeUndefined();
    expect(all.find((i) => i.to === '/settings' || i.to === '/more')).toBeDefined();
  });
});

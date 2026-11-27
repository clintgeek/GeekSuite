/**
 * The navigation of the one app (DOCS/ONE_APP_PLAN.md §3, "Fewer places"):
 *   - sidebar: Today · Weight · Blood pressure · Medications · Trends · Saved
 *     foods, the same for everybody (the functions take no mode);
 *   - phone tabs: Today · Weight · Pressure · Meds · More;
 *   - More: Blood pressure, Medications, Saved foods, Calorie plan, Import a
 *     scan, Settings;
 *   - the pages that folded into Today, Trends and Saved foods have no row,
 *     and neither does Profile (/profile redirects to Settings);
 *   - the top bar says the same word as the row or tab.
 */
import { describe, it, expect } from 'vitest';
import {
  navSectionsFor, navSections, moreGroupsFor, pageTitle, bottomNavItems, bottomNavActiveId, activeNavId,
} from '../../components/Layout/navConfig.jsx';

const items = (sections) => sections.flatMap((s) => s.items);
const labels = (sections) => items(sections).map((i) => i.label);

describe('the sidebar', () => {
  it('is six rows: Today, Weight, Blood pressure, Medications, Trends, Saved foods', () => {
    expect(labels(navSectionsFor())).toEqual(['Today', 'Weight', 'Blood pressure', 'Medications', 'Trends', 'Saved foods']);
    expect(items(navSectionsFor()).map((i) => i.to)).toEqual(['/dashboard', '/weight', '/blood-pressure', '/medications', '/trends', '/saved-foods']);
  });

  it('is the same whatever is passed: there is no mode', () => {
    expect(labels(navSectionsFor('simple'))).toEqual(labels(navSectionsFor('full')));
    expect(labels(navSections)).toEqual(labels(navSectionsFor()));
  });
});

describe('the phone tabs', () => {
  it('are Today, Weight, Pressure, Meds, More: every daily job has a tab', () => {
    expect(bottomNavItems.map((i) => i.label)).toEqual(['Today', 'Weight', 'Pressure', 'Meds', 'More']);
    expect(bottomNavItems.map((i) => i.to)).toEqual(['/dashboard', '/weight', '/blood-pressure', '/medications', '/more']);
  });

  it('light their own tab, and More for anything reached through it', () => {
    expect(bottomNavActiveId('/dashboard')).toBe('/dashboard');
    expect(bottomNavActiveId('/weight')).toBe('/weight');
    expect(bottomNavActiveId('/blood-pressure')).toBe('/blood-pressure');
    expect(bottomNavActiveId('/medications')).toBe('/medications');
    expect(bottomNavActiveId('/trends')).toBe('/more');
    for (const path of ['/more', '/trends', '/saved-foods', '/calorie-wizard', '/scan-import', '/settings', '/food-search']) {
      expect(bottomNavActiveId(path)).toBe('/more');
    }
  });
});

describe('More', () => {
  it('lists Blood pressure, Medications, Saved foods, Calorie plan, Import a scan, Settings', () => {
    expect(labels(moreGroupsFor())).toEqual(['Trends', 'Saved foods', 'Calorie plan', 'Import a scan', 'Settings']);
    expect(labels(moreGroupsFor('simple'))).toEqual(labels(moreGroupsFor('full')));
  });

  it('every row says what the page is, in a line, and none mentions a mode', () => {
    for (const item of items(moreGroupsFor())) {
      expect(item.description).toBeTruthy();
      expect(item.description).not.toMatch(/Simple|Full/);
    }
  });
});

describe('what folded away has no row', () => {
  it.each(['/food-log', '/reports', '/activity', '/health', '/my-meals', '/my-foods', '/food-search', '/profile'])('%s', (to) => {
    const all = [...items(navSectionsFor()), ...items(moreGroupsFor()), ...bottomNavItems];
    expect(all.find((i) => i.to === to)).toBeUndefined();
    expect(activeNavId(to)).toBeUndefined();
  });
});

describe('the top bar title', () => {
  it('is the same word as the row or tab', () => {
    expect(pageTitle('/dashboard')).toBe('Today');
    expect(pageTitle('/trends')).toBe('Trends');
    expect(pageTitle('/saved-foods')).toBe('Saved foods');
    expect(pageTitle('/more')).toBe('More');
    expect(pageTitle('/settings')).toBe('Settings');
    expect(pageTitle('/calorie-wizard')).toBe('Calorie plan');
  });

  it('the food search keeps its route and its name, with no row', () => {
    expect(pageTitle('/food-search')).toBe('Look up a specific food');
  });
});

import { describe, it, expect } from 'vitest';
import { activeNavId, bottomNavItems, navSections, pageTitle } from '../../components/navConfig';

describe('bottomNavItems', () => {
  it('has at most 5 rows (the phone tab bar ceiling)', () => {
    expect(bottomNavItems.length).toBeLessThanOrEqual(5);
  });

  it('never carries Settings or Sign out — those live in the top bar', () => {
    const labels = bottomNavItems.map((item) => item.label.toLowerCase());
    expect(labels).not.toContain('settings');
    expect(labels.some((label) => label.includes('sign out'))).toBe(false);
  });

  it('draws every row from the sidebar nav sections', () => {
    const sidebarIds = navSections.flatMap((section) => section.items.map((item) => item.id));
    bottomNavItems.forEach((item) => {
      expect(sidebarIds).toContain(item.id);
    });
  });
});

describe('activeNavId', () => {
  it('matches Home only at the root', () => {
    expect(activeNavId('/')).toBe('/');
  });

  it('matches a subtree, not just the exact path', () => {
    expect(activeNavId('/birds/42')).toBe('/birds');
  });

  it('routes /settings to the settings id with no nav row of its own', () => {
    expect(activeNavId('/settings')).toBe('settings');
    const sidebarIds = navSections.flatMap((section) => section.items.map((item) => item.id));
    expect(sidebarIds).not.toContain('settings');
  });
});

describe('pageTitle', () => {
  it('names a known route', () => {
    expect(pageTitle('/egg-log')).toBe('Egg Log');
  });

  it('falls back to the app name for an unknown route', () => {
    expect(pageTitle('/nonsense')).toBe('FlockGeek');
  });
});

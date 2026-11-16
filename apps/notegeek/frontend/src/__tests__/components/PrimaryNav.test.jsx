import { describe, it, expect } from 'vitest';
import { hidesBottomBar, navValueFor } from '../../components/PrimaryNav';

/**
 * The rules MobileBottomNav carried before the tablet wave (2026-11-16) moved
 * them into PrimaryNav.jsx, where one items array serves the phone's bar, the
 * tablet's rail and the desktop sidebar. The surfaces themselves are covered
 * by tabletLayout.test.jsx.
 */
describe('PrimaryNav rules', () => {
  it('the phone bar hides on a single note and the auth pages, not on lists', () => {
    for (const path of ['/notes/new', '/notes/123', '/notes/123/edit', '/login', '/register']) {
      expect(hidesBottomBar(path)).toBe(true);
    }
    for (const path of ['/', '/notes', '/search', '/tags/house', '/archived', '/settings']) {
      expect(hidesBottomBar(path)).toBe(false);
    }
  });

  it('the phone keeps its mapping: tags and archived belong to Notes', () => {
    expect(navValueFor('/')).toBe('home');
    expect(navValueFor('/search?q=x')).toBe('search');
    expect(navValueFor('/notes')).toBe('notes');
    expect(navValueFor('/tags/house')).toBe('notes');
    expect(navValueFor('/archived')).toBe('notes');
    expect(navValueFor('/settings')).toBe('home');
  });

  it('the rail has a Tags item, so tag views, Archived and Recently deleted light it', () => {
    expect(navValueFor('/tags/house', { rail: true })).toBe('tags');
    expect(navValueFor('/archived', { rail: true })).toBe('tags');
    expect(navValueFor('/deleted', { rail: true })).toBe('tags');
    expect(navValueFor('/notes/abc', { rail: true })).toBe('notes');
  });
});

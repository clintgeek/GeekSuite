import { describe, it, expect, vi } from 'vitest';
import { buildNavItems, hidesBottomBar, navValueFor } from '../../components/PrimaryNav';
import { MEETING_PATH } from '../../utils/oneOnOne';
import { pageTitle } from '../../components/navConfig';

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

  // Review 2026-11-18 #9: Recently deleted lit Home and was titled "NoteGeek".
  it('Recently deleted belongs to Notes and is titled as itself; Share is "Shared"', () => {
    expect(navValueFor('/deleted')).toBe('notes');
    expect(pageTitle('/deleted')).toBe('Recently deleted');
    expect(pageTitle('/share')).toBe('Shared');
  });

  it('the rail has a Tags item, so tag views, Archived and Recently deleted light it', () => {
    expect(navValueFor('/tags/house', { rail: true })).toBe('tags');
    expect(navValueFor('/archived', { rail: true })).toBe('tags');
    expect(navValueFor('/deleted', { rail: true })).toBe('tags');
    expect(navValueFor('/notes/abc', { rail: true })).toBe('notes');
  });

  it('the rail carries 1:1 and Meeting, one tap each; the phone bar does not', () => {
    const navigate = vi.fn();
    const rail = buildNavItems({ value: 'notes', rail: true, navigate, onNew: () => {}, onTags: () => {} });
    expect(rail.map((i) => i.id)).toEqual(['home', 'search', 'new', 'notes', 'one-on-one', 'meeting', 'tags']);
    rail.find((i) => i.id === 'meeting').onClick();
    expect(navigate).toHaveBeenCalledWith(MEETING_PATH);
    const bar = buildNavItems({ value: 'notes', rail: false, navigate, onNew: () => {}, onTags: () => {} });
    expect(bar.map((i) => i.id)).toEqual(['home', 'search', 'new', 'notes']);
  });
});

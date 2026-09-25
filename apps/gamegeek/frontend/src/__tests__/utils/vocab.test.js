import { describe, expect, it } from 'vitest';
import {
  completionLabel,
  defaultStorefrontFor,
  humanize,
  modeLabel,
  platformLabel,
  platformShort,
  shelfLabel,
  sortPlatforms,
  storefrontLabel,
} from '../../utils/vocab';

describe('vocab labels', () => {
  it('names the ids people actually see', () => {
    expect(platformLabel('switch')).toBe('Switch');
    expect(platformLabel('steam-deck')).toBe('Steam Deck');
    expect(platformLabel('nes')).toBe('NES');
    expect(platformShort('steam-deck')).toBe('Deck');
    expect(platformShort('ps5')).toBe('PS5');
    expect(platformShort('switch')).toBe('Switch');
    expect(storefrontLabel('gog')).toBe('GOG');
    expect(storefrontLabel('luna')).toBe('Amazon Luna');
    expect(modeLabel('coop-local')).toBe('Couch co-op');
    expect(completionLabel('complete')).toBe('100%');
    expect(shelfLabel('on-hold')).toBe('On hold');
  });

  it('falls back to a readable label for an id it has never heard of', () => {
    expect(platformLabel('neo-geo-pocket')).toBe('Neo Geo Pocket');
    expect(platformShort('virtual-boy')).toBe('Virtual Boy');
    expect(storefrontLabel('humble_bundle')).toBe('Humble Bundle');
    expect(humanize('')).toBe('');
    expect(humanize(null)).toBe('');
    expect(platformLabel(undefined)).toBe('');
  });

  it('custom shelves read by their profile label, else by their slug', () => {
    expect(shelfLabel('custom-couch-coop', [{ id: 'custom-couch-coop', label: 'Couch co-op 🛋' }])).toBe('Couch co-op 🛋');
    expect(shelfLabel('custom-comfort-games')).toBe('Comfort Games');
  });

  it('orders platforms the vocabulary’s way and picks sensible storefronts', () => {
    expect(sortPlatforms(['switch', 'pc', 'nes', 'switch', 'mystery'])).toEqual(['pc', 'switch', 'nes', 'mystery']);
    expect(defaultStorefrontFor('steam-deck')).toBe('steam');
    expect(defaultStorefrontFor('switch')).toBe('nintendo');
    expect(defaultStorefrontFor('nes')).toBe('');
  });
});

/**
 * Default per-source URL path rules (`Source.pathExclude`, 2026-10-11, plan
 * "Ingest hygiene"). Patterns are regex sources tested against an item URL's
 * pathname at ingest (@geeksuite/schemas/newsgeek/pathRules).
 *
 * Evidence (production audit, 2026-10-11):
 * - Blox (TownNews) generic feeds carry the platform's syndicated filler:
 *   Malvern Daily Record 50 of 50 and Saline Courier 50 of 50 items under
 *   /online_features/press_releases/; Ashley County Ledger 27 press releases,
 *   14 /news/national/ and more /online_features/….
 * - The Guardian's US feed: 12 /sport/ and 2 /football/ of ~65 (TV listings
 *   like "NFL today: How to watch…").
 *
 * Fresh installs get these through the seed (./data.js); an existing
 * database through scripts/set-path-rules.js, which sets exactly this map.
 */

const BLOX_RULES = ['^/online_features/', '/press_releases/', '^/news/(national|world|nation)/', '^/ap/'];

export const PATH_RULES_BY_SLUG = {
  'malvern-daily-record': BLOX_RULES,
  'saline-courier': BLOX_RULES,
  'ashley-county-ledger': BLOX_RULES,
  'log-cabin-democrat': BLOX_RULES,
  'magnolia-reporter': BLOX_RULES,
  ktbs: BLOX_RULES,
  'guardian-us': ['^/sport/', '^/football/'],
};

export default { PATH_RULES_BY_SLUG };

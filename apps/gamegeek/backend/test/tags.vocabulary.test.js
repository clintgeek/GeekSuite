/**
 * The canonical tag vocabulary and genre canonicalization
 * (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A1, §A5) — the synonym table
 * pinned case by case, drops included, plus the real provider terms recorded
 * live on 2026-09-25 (test/fixtures/igdb-tags*.json, rawg-tags.json).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import constantsModule from '@geeksuite/schemas/gamegeek/constants';
import { normalizeIgdbTagRows } from '../src/metadata/igdb.js';
import { rawgTagTerms } from '../src/metadata/rawg.js';

const { TAG_GROUPS, ALL_TAGS, TAG_SYNONYMS, MAX_AUTO_TAGS, normalizeTagTerm, canonicalTag, mapProviderTags, canonicalGenres, GENRE_CANONICAL } =
  constantsModule;

const fixture = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));

// [provider term, canonical tag or null (dropped)]
const CASES = [
  // IGDB themes
  ['Science fiction', 'Sci-fi'],
  ['Horror', 'Horror'],
  ['Survival', 'Survival'],
  ['Open world', 'Open World'],
  ['Sandbox', 'Sandbox'],
  ['Comedy', 'Comedy'],
  ['Mystery', 'Mystery'],
  ['Historical', 'Historical'],
  ['Warfare', 'Military'],
  ['Stealth', 'Stealth'],
  ['Kids', null],
  ['Erotic', null],
  ['Non-fiction', null],
  ['4X (explore, expand, exploit, and exterminate)', '4X'],
  ['Business', 'Management'],
  ['Educational', null],
  ['Romance', null],
  ['Action', null],
  ['Drama', null],
  ['Thriller', null],
  ['Party', 'Party'],
  ['Fantasy', 'Fantasy'],
  // IGDB perspectives
  ['First person', 'First-person'],
  ['Third person', 'Third-person'],
  ['Bird view / Isometric', 'Isometric'],
  ['Side view', 'Side-scroller'],
  ['Text', null],
  ['Auditory', null],
  ['Virtual Reality', 'VR'],
  // IGDB keywords / RAWG slugs and names
  ['roguelike', 'Roguelike'],
  ['roguelite', 'Roguelite'],
  ['rogue-lite', 'Roguelite'],
  ['rogue-like', 'Roguelike'],
  ['metroidvania', 'Metroidvania'],
  ['souls-like', 'Soulslike'],
  ['soulslike', 'Soulslike'],
  ['pixel-graphics', 'Pixel Art'],
  ['Pixel Art', 'Pixel Art'],
  ['2d', '2D'],
  ['3D', '3D'],
  ['story-rich', 'Story Rich'],
  ['story driven', 'Story Rich'],
  ['choices-matter', 'Choices Matter'],
  ['multiple-endings', 'Multiple Endings'],
  ['gameplay feature: multiple endings', 'Multiple Endings'],
  ['atmospheric', 'Atmospheric'],
  ['great-soundtrack', null],
  ['difficult', 'Difficult'],
  ['relaxing', 'Relaxing'],
  ['cozy', 'Cozy'],
  ['crafting', 'Crafting'],
  ['base-building', 'Base Building'],
  ['deckbuilding', 'Deckbuilder'],
  ['deck-building', 'Deckbuilder'],
  ['tower-defense', 'Tower Defense'],
  ['bullet hell', 'Bullet Hell'],
  ['twin-stick-shooter', 'Twin-Stick'],
  ['twin stick', 'Twin-Stick'],
  ['puzzle-platformer', 'Puzzle-Platformer'],
  ['physics', 'Physics'],
  ['city-builder', 'City Builder'],
  ['city builder', 'City Builder'],
  ['colony-sim', 'Colony Sim'],
  ['management', 'Management'],
  ['turn-based', 'Turn-Based'],
  ['Turn-Based Combat', 'Turn-Based'],
  ['real-time', 'Real-Time'],
  ['loot', 'Loot'],
  ['looter-shooter', 'Looter Shooter'],
  ['looter shooter', 'Looter Shooter'],
  ['exploration', 'Exploration'],
  ['open-world', 'Open World'],
  ['survival-horror', 'Survival Horror'],
  ['psychological-horror', 'Psychological Horror'],
  ['zombies', 'Zombies'],
  ['post-apocalyptic', 'Post-apocalyptic'],
  ['cyberpunk', 'Cyberpunk'],
  ['space', 'Space'],
  ['space simulation', 'Space'],
  ['sci-fi', 'Sci-fi'],
  ['dark-fantasy', 'Dark Fantasy'],
  ['dark fantasy', 'Dark Fantasy'],
  ['medieval', 'Medieval'],
  ['western', 'Western'],
  ['lovecraftian', 'Lovecraftian'],
  ['eldritch horror', 'Lovecraftian'],
  ['anime', 'Anime'],
  ['mythology', 'Mythology'],
  ['pirates', 'Pirates'],
  ['hand-drawn', 'Hand-drawn'],
  ['low-poly', 'Low-poly'],
  ['cartoony', 'Cartoony'],
  ['cartoon', 'Cartoony'],
  ['realistic', 'Realistic'],
  ['isometric', 'Isometric'],
  ['top-down', 'Top-down'],
  ['side-scroller', 'Side-scroller'],
  ['sidescroller', 'Side-scroller'],
  ['first-person', 'First-person'],
  ['third-person', 'Third-person'],
  ['vr', 'VR'],
  ['rhythm', 'Rhythm'],
  ['party', 'Party'],
  ['idle', 'Idle'],
  ['auto-battler', 'Auto Battler'],
  ['battle-royale', 'Battle Royale'],
  ['extraction-shooter', 'Extraction'],
  ['hero-shooter', 'Hero Shooter'],
  ['beat-em-up', "Beat 'em up"],
  ["Beat 'em up", "Beat 'em up"],
  ['platformer', 'Platformer'],
  ['hidden-object', 'Hidden Object'],
  ['walking-simulator', 'Walking Simulator'],
  ['narrative', 'Narrative'],
  ['mystery', 'Mystery'],
  ['detective', 'Detective'],
  ['comedy', 'Comedy'],
  ['emotional', 'Emotional'],
  ['dark', 'Dark'],
  ['farming-sim', 'Farming'],
  ['fishing', 'Fishing'],
  ['hunting', 'Hunting'],
  ['driving', 'Driving'],
  ['flight', 'Flight'],
  ['superhero', 'Superhero'],
  ['nature', 'Nature'],
  ['stealth', 'Stealth'],
  ['tactical', 'Tactics'],
  ['grand-strategy', 'Grand Strategy'],
  ['grand strategy', 'Grand Strategy'],
  ['4x', '4X'],
  ['retro graphics', 'Retro'],
  // Noise that must never become a tag
  ['steam achievements', null],
  ['singleplayer', null],
  ['steam-cloud', null],
  ['pax east 2016', null],
  ['previously on - prime gaming', null],
  ['rpg', null],
  ['', null],
];

describe('the vocabulary', () => {
  test('groups are the spec’s four, in order, with no tag in two groups', () => {
    assert.deepEqual(
      TAG_GROUPS.map((g) => g.label),
      ['Gameplay', 'Story & mood', 'Setting', 'Look & view']
    );
    assert.equal(new Set(ALL_TAGS).size, ALL_TAGS.length);
    assert.equal(ALL_TAGS.length, TAG_GROUPS.reduce((n, g) => n + g.tags.length, 0));
  });

  test('every canonical tag maps to itself', () => {
    for (const tag of ALL_TAGS) assert.equal(canonicalTag(tag), tag, tag);
  });

  test('every synonym target is a canonical tag (or an explicit drop)', () => {
    for (const [key, value] of Object.entries(TAG_SYNONYMS)) {
      assert.ok(value === null || ALL_TAGS.includes(value), `${key} → ${value}`);
      assert.equal(normalizeTagTerm(key), key, `key "${key}" is stored normalized`);
    }
  });

  test('the synonym table has at least 40 pinned cases', () => {
    assert.ok(CASES.length >= 40);
  });

  for (const [term, expected] of CASES) {
    test(`"${term}" → ${expected === null ? 'dropped' : expected}`, () => {
      assert.equal(canonicalTag(term), expected);
    });
  }

  test('normalization: case, punctuation, apostrophes, ampersands', () => {
    assert.equal(normalizeTagTerm("  Beat 'Em Up "), 'beat em up');
    assert.equal(normalizeTagTerm('Bird view / Isometric'), 'bird view isometric');
    assert.equal(normalizeTagTerm('Rock & Roll'), 'rock and roll');
    assert.equal(normalizeTagTerm(null), '');
    assert.equal(canonicalTag('OPEN_WORLD'), 'Open World');
  });
});

describe('mapProviderTags', () => {
  test('dedupes, drops unmapped, orders by group then first-seen', () => {
    const out = mapProviderTags(['First person', 'Science fiction', 'steam', 'Open world', 'sci-fi', 'exploration', 'Mystery', 'open-world']);
    assert.deepEqual(out, ['Open World', 'Exploration', 'Mystery', 'Sci-fi', 'First-person']);
  });

  test(`caps at ${MAX_AUTO_TAGS}, keeping the earlier groups`, () => {
    const gameplay = TAG_GROUPS[0].tags.slice(0, 10);
    const look = TAG_GROUPS[3].tags.slice(0, 5);
    const out = mapProviderTags([...look, ...gameplay]);
    assert.equal(out.length, MAX_AUTO_TAGS);
    assert.deepEqual(out, [...gameplay, ...look.slice(0, 2)]);
  });

  test('non-arrays and non-strings are safe', () => {
    assert.deepEqual(mapProviderTags(null), []);
    assert.deepEqual(mapProviderTags([null, 42, {}, 'Horror']), ['Horror']);
  });

  test('real IGDB rows recorded 2026-09-25 map to sensible tags', () => {
    const rows = [...fixture('igdb-tags.json'), ...fixture('igdb-tags-steam-lookup.json')];
    const terms = normalizeIgdbTagRows(rows);
    const tagsFor = (id) => mapProviderTags(terms.get(String(id)));
    assert.deepEqual(tagsFor(11737), ['Open World', 'Exploration', 'Mystery', 'Sci-fi', 'Space', 'First-person']); // Outer Wilds
    assert.deepEqual(tagsFor(284491), ['Metroidvania', 'Soulslike', 'Fantasy', 'Dark Fantasy', 'Side-scroller']); // Grime
    assert.deepEqual(tagsFor(296832), ['Bullet Hell', 'Twin-Stick', 'Horror', 'Fantasy', 'Dark Fantasy', 'Lovecraftian', 'Isometric']); // Kill Knight
    assert.deepEqual(tagsFor(55036), ['Management', 'City Builder', 'Historical', 'Isometric']); // Anno 1800
    // Noise like "steam", "achievements", "pax east 2016" never survives.
    for (const id of terms.keys()) for (const t of tagsFor(id)) assert.ok(ALL_TAGS.includes(t));
  });

  test('real RAWG tags: Fallout hits the cap, Dagon reads as a Lovecraftian walking sim', () => {
    const [fallout, , dagon] = fixture('rawg-tags.json');
    const f = mapProviderTags(rawgTagTerms(fallout.tags));
    assert.equal(f.length, MAX_AUTO_TAGS);
    assert.ok(f.includes('Post-apocalyptic') && f.includes('Turn-Based') && f.includes('Tactics'));
    const d = mapProviderTags(rawgTagTerms(dagon.tags));
    assert.ok(d.includes('Lovecraftian') && d.includes('Walking Simulator') && d.includes('First-person'));
  });
});

describe('canonicalGenres', () => {
  test('the spec’s table', () => {
    const cases = [
      ['Role-playing (RPG)', 'RPG'],
      ['RPG', 'RPG'],
      ['Turn-based strategy (TBS)', 'Turn-based Strategy'],
      ['Real Time Strategy (RTS)', 'Real-time Strategy'],
      ["Hack and slash/Beat 'em up", 'Hack & Slash'],
      ['Platform', 'Platformer'],
      ['Platformer', 'Platformer'],
      ['Simulator', 'Simulation'],
      ['Simulation', 'Simulation'],
      ['Card & Board Game', 'Card & Board'],
      ['Board Games', 'Card & Board'],
      ['Sport', 'Sports'],
      ['Point-and-click', 'Point & Click'],
      ['Massively Multiplayer', 'MMO'],
    ];
    for (const [from, to] of cases) assert.deepEqual(canonicalGenres([from]), [to], from);
    assert.equal(Object.keys(GENRE_CANONICAL).length, 15);
  });

  test('case-insensitive lookup, unknowns kept, deduped after mapping', () => {
    assert.deepEqual(canonicalGenres(['role-playing (rpg)', 'RPG', ' Indie ', 'indie', 'Platform', 'Platformer', 'Adventure']), [
      'RPG',
      'Indie',
      'Platformer',
      'Adventure',
    ]);
  });

  test('idempotent, and junk dropped', () => {
    const once = canonicalGenres(['Simulator', 'Board Games', 'Shooter']);
    assert.deepEqual(canonicalGenres(once), once);
    assert.deepEqual(canonicalGenres([null, '', '  ', 3, 'Puzzle']), ['Puzzle']);
    assert.deepEqual(canonicalGenres(undefined), []);
  });
});

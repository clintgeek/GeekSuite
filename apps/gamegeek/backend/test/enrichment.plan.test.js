/**
 * Fill-only-empty and its undo — apps/gamegeek/DOCS/METADATA_ENRICHMENT.md
 * §What gets filled, §Record per game.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { planFill, planUnlink, valueHash, emptyFilter, defaultFor } from '../src/enrichment/plan.js';
import { toPlainText, decodeEntities, capText } from '../src/enrichment/text.js';

const emptyGame = () => ({
  _id: 'g1',
  householdId: 'default',
  title: 'Portal 2',
  tags: ['coop'],
  copies: [{ platform: 'pc' }],
  developers: [],
  publishers: [],
  genres: [],
  description: '',
  releaseDate: null,
  modes: [],
  maxLocalPlayers: null,
  platformsAvailable: ['pc'],
  timeToBeat: { main: null, extra: null, complete: null },
  externalIds: { igdb: null, steamAppId: null, rawg: null },
  coverPath: null,
});

const detail = () => ({
  provider: 'igdb',
  providerId: '1020',
  title: 'Portal 2 (IGDB)',
  description: '<p>Think &amp; portal.</p>',
  developers: ['Valve'],
  publishers: ['Valve', 'Electronic Arts'],
  genres: ['Puzzle'],
  releaseDate: '2011-04-18T00:00:00.000Z',
  modes: ['single', 'coop-local', 'not-a-mode'],
  maxLocalPlayers: 2,
  timeToBeat: { main: 8.4, extra: 12.6, complete: 22.5 },
  platforms: ['pc', 'linux', 'ps3', 'amiga'],
  externalIds: { igdb: '1020', steamAppId: '620' },
  tags: ['should never be read'],
});

describe('planFill', () => {
  test('an empty game gets every field the detail has, and only those', () => {
    const { set, filled, hashes, addPlatforms } = planFill(emptyGame(), detail());
    assert.deepEqual(filled, [
      'description',
      'developers',
      'publishers',
      'genres',
      'releaseDate',
      'modes',
      'maxLocalPlayers',
      'timeToBeat.main',
      'timeToBeat.extra',
      'timeToBeat.complete',
      'externalIds.steamAppId',
      'externalIds.igdb',
    ]);
    assert.equal(set.description, 'Think & portal.');
    assert.deepEqual(set.modes, ['single', 'coop-local']);
    assert.ok(set.releaseDate instanceof Date);
    assert.equal(set['externalIds.steamAppId'], '620');
    assert.deepEqual(addPlatforms, ['linux', 'ps3']); // union, our vocabulary only
    assert.deepEqual(Object.keys(hashes).sort(), [...filled].sort());
  });

  test('never title, tags, copies, coverPath or anything personal', () => {
    const { set } = planFill(emptyGame(), detail());
    for (const k of Object.keys(set)) assert.ok(!/^(title|tags|copies|coverPath|shelf|rating|hours)/.test(k), k);
  });

  test('never overwrites a non-empty field', () => {
    const game = {
      ...emptyGame(),
      description: 'Mine.',
      developers: ['Somebody'],
      genres: ['Action'],
      releaseDate: new Date('2011-04-19T00:00:00Z'),
      modes: ['single'],
      maxLocalPlayers: 4,
      timeToBeat: { main: 5, extra: null, complete: null },
      externalIds: { igdb: '1', steamAppId: '9', rawg: null },
    };
    const { set, filled } = planFill(game, detail());
    assert.deepEqual(filled, ['publishers', 'timeToBeat.extra', 'timeToBeat.complete']);
    assert.equal(set.description, undefined);
    assert.equal(set['externalIds.igdb'], undefined);
  });

  test('an external id held by another game in the household is not taken', () => {
    const { set, filled } = planFill(emptyGame(), detail(), { takenIds: { steamAppId: new Set(['620']) } });
    assert.equal(set['externalIds.steamAppId'], undefined);
    assert.ok(!filled.includes('externalIds.steamAppId'));
    assert.equal(set['externalIds.igdb'], '1020');
  });

  test('missing nested objects count as empty', () => {
    const game = { _id: 'g', householdId: 'h', title: 'X' };
    const { filled } = planFill(game, detail());
    assert.ok(filled.includes('timeToBeat.main'));
    assert.ok(filled.includes('externalIds.igdb'));
  });

  test('bad numbers are dropped, not written', () => {
    const { filled } = planFill(emptyGame(), { ...detail(), maxLocalPlayers: 0, timeToBeat: { main: -1, extra: 'x', complete: 1e9 } });
    for (const f of ['maxLocalPlayers', 'timeToBeat.main', 'timeToBeat.extra', 'timeToBeat.complete']) assert.ok(!filled.includes(f), f);
  });

  test('a null detail plans nothing', () => {
    assert.deepEqual(planFill(emptyGame(), null), { set: {}, filled: [], hashes: {}, addPlatforms: [] });
  });
});

describe('planUnlink — clears only what still holds enrichment’s value', () => {
  function enrichedGame() {
    const game = emptyGame();
    const plan = planFill(game, detail());
    for (const [k, v] of Object.entries(plan.set)) {
      const [a, b] = k.split('.');
      if (b) game[a][b] = v;
      else game[k] = v;
    }
    game.platformsAvailable.push(...plan.addPlatforms);
    game.coverPath = 'g1.jpg';
    game.enrichment = {
      status: 'matched',
      filled: [...plan.filled, 'platformsAvailable', 'coverPath'],
      filledHashes: plan.hashes,
      addedPlatforms: plan.addPlatforms,
      coverFromEnrichment: true,
    };
    return game;
  }

  test('untouched since enrichment → every filled field back to its default, cover cleared', () => {
    const plan = planUnlink(enrichedGame());
    assert.equal(plan.kept.length, 0);
    assert.equal(plan.set.description, '');
    assert.deepEqual(plan.set.developers, []);
    assert.equal(plan.set.releaseDate, null);
    assert.equal(plan.set['timeToBeat.main'], null);
    assert.equal(plan.set['externalIds.steamAppId'], null);
    assert.equal(plan.set.coverPath, null);
    assert.equal(plan.clearCover, true);
    assert.deepEqual(plan.pullPlatforms, ['linux', 'ps3']);
  });

  test('a field the user edited after the match is kept', () => {
    const game = enrichedGame();
    game.description = 'My own words.';
    game.developers = ['Valve', 'Hidden Path'];
    const plan = planUnlink(game);
    assert.deepEqual(plan.kept.sort(), ['description', 'developers']);
    assert.equal('description' in plan.set, false);
    assert.equal('developers' in plan.set, false);
    assert.ok(plan.cleared.includes('publishers'));
  });

  test('a cover the user replaced (coverFromEnrichment false) is kept', () => {
    const game = enrichedGame();
    game.enrichment.coverFromEnrichment = false;
    const plan = planUnlink(game);
    assert.equal(plan.clearCover, false);
    assert.ok(plan.kept.includes('coverPath'));
  });

  test('a filled field with no recorded hash is kept (conservative)', () => {
    const game = enrichedGame();
    delete game.enrichment.filledHashes.genres;
    assert.ok(planUnlink(game).kept.includes('genres'));
  });

  test('never touches a field not in `filled`', () => {
    const game = enrichedGame();
    game.enrichment.filled = ['genres'];
    const plan = planUnlink(game);
    assert.deepEqual(Object.keys(plan.set), ['genres']);
  });

  test('Dates hash the same after a round trip through the DB', () => {
    const d = new Date('2011-04-18T00:00:00Z');
    assert.equal(valueHash(d), valueHash(new Date(d.getTime())));
    assert.notEqual(valueHash(['a', 'b']), valueHash(['b', 'a']));
  });
});

describe('guard filters and defaults', () => {
  test('emptyFilter per kind', () => {
    assert.deepEqual(emptyFilter('developers'), { 'developers.0': { $exists: false } });
    assert.deepEqual(emptyFilter('description'), { description: { $in: [null, ''] } });
    assert.deepEqual(emptyFilter('externalIds.igdb'), { 'externalIds.igdb': { $in: [null, ''] } });
    assert.deepEqual(emptyFilter('releaseDate'), { releaseDate: null });
    assert.deepEqual(emptyFilter('coverPath'), { coverPath: null });
  });

  test('defaults match the schema', () => {
    assert.deepEqual(defaultFor('genres'), []);
    assert.equal(defaultFor('description'), '');
    assert.equal(defaultFor('maxLocalPlayers'), null);
  });
});

describe('text helpers', () => {
  test('decodeEntities', () => {
    assert.equal(decodeEntities('&quot;a&quot; &amp; &#39;b&#39; &#x2014; &bogus;'), '"a" & \'b\' — &bogus;');
  });
  test('toPlainText strips script/style and tags', () => {
    assert.equal(toPlainText('<style>x{}</style><h2>About</h2>Great<br/>game'), 'About Great game');
  });
  test('capText cuts at a word boundary with an ellipsis', () => {
    const out = capText('alpha beta gamma delta', 12);
    assert.ok(out.length <= 12);
    assert.equal(out, 'alpha beta…');
    assert.equal(capText('short', 12), 'short');
  });
});

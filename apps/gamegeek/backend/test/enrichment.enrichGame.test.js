/**
 * enrichGame / applyCandidate / unlinkGame / listCandidates against an
 * in-memory Game and fake providers (no network, no Mongo).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichGame, applyCandidate, unlinkGame, listCandidates } from '../src/enrichment/enrichGame.js';
import { createFakeGameModel } from './helpers/fakeGameModel.js';
import { fakeProviderSet, detailOf, searchHit } from './helpers/fakeProviders.js';

const baseGame = (over = {}) => ({
  _id: 'aaaaaaaaaaaaaaaaaaaaaaa1',
  householdId: 'default',
  title: 'Portal 2',
  tags: [],
  copies: [],
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
  enrichment: null,
  ...over,
});

function setup({ games = [baseGame()], providers = fakeProviderSet(), hooks, cover = { buffer: Buffer.from('img'), ext: 'jpg' } } = {}) {
  const Game = createFakeGameModel(games, hooks);
  const coverCalls = { fetch: [], write: [], delete: [] };
  const deps = {
    Game,
    providers,
    fetchCover: async (urls) => {
      coverCalls.fetch.push(urls);
      return cover;
    },
    writeCover: async (id, ext) => {
      coverCalls.write.push(`${id}.${ext}`);
      return `${id}.${ext}`;
    },
    deleteCover: async (f) => coverCalls.delete.push(f),
    now: () => new Date('2026-09-25T12:00:00Z'),
  };
  return { Game, deps, providers, coverCalls };
}

const ref = (id = 'aaaaaaaaaaaaaaaaaaaaaaa1') => ({ _id: id, householdId: 'default' });

describe('enrichGame — provider order', () => {
  test('a game with a steamAppId goes to Steam appdetails first; nothing else is asked', async () => {
    const providers = fakeProviderSet({
      steamAppDetails: { details: { 620: detailOf('steam', '620', 'Portal 2') } },
      igdb: { configured: true },
    });
    const { Game, deps } = setup({ games: [baseGame({ externalIds: { steamAppId: '620' } })], providers });
    const { outcome, enrichment } = await enrichGame(ref(), deps);
    assert.equal(outcome, 'matched');
    assert.equal(enrichment.provider, 'steam');
    assert.deepEqual(enrichment.providersTried, ['steam']);
    assert.deepEqual(providers.steps.steamAppDetails.calls.detail, ['620']);
    assert.equal(providers.steps.igdb.calls.search.length, 0);
    assert.equal(Game.get(ref()._id).developers[0], 'Dev Co');
  });

  test('unconfigured providers are skipped and not recorded as tried', async () => {
    const providers = fakeProviderSet({
      steamSearch: { search: { 'Portal 2': [searchHit('steam', '620', 'Portal 2')] }, details: { 620: detailOf('steam', '620', 'Portal 2') } },
    });
    const { deps } = setup({ providers });
    const { enrichment } = await enrichGame(ref(), deps);
    assert.deepEqual(enrichment.providersTried, ['steam']);
    assert.equal(providers.steps.igdb.calls.search.length, 0);
    assert.equal(providers.steps.rawg.calls.search.length, 0);
  });

  test('IGDB (configured) wins before RAWG and Steam search', async () => {
    const providers = fakeProviderSet({
      igdb: { configured: true, search: { 'Portal 2': [searchHit('igdb', '1020', 'Portal 2')] }, details: { 1020: detailOf('igdb', '1020', 'Portal 2') } },
      rawg: { configured: true },
    });
    const { deps } = setup({ providers });
    const { enrichment } = await enrichGame(ref(), deps);
    assert.equal(enrichment.provider, 'igdb');
    assert.deepEqual(enrichment.providersTried, ['igdb']);
    assert.equal(providers.steps.rawg.calls.search.length, 0);
    assert.equal(providers.steps.steamSearch.calls.search.length, 0);
  });

  test('ambiguous at IGDB, nothing at RAWG → Steam search still gets its turn', async () => {
    const providers = fakeProviderSet({
      igdb: { configured: true, search: { 'Portal 2': [searchHit('igdb', '1', 'Portal 2'), searchHit('igdb', '2', 'Portal 2')] } },
      rawg: { configured: true },
      steamSearch: { search: { 'Portal 2': [searchHit('steam', '620', 'Portal 2')] }, details: { 620: detailOf('steam', '620', 'Portal 2') } },
    });
    const { deps } = setup({ providers });
    const { enrichment } = await enrichGame(ref(), deps);
    assert.equal(enrichment.provider, 'steam');
    assert.deepEqual(enrichment.providersTried, ['igdb', 'rawg', 'steam']);
    assert.equal(providers.steps.igdb.calls.detail.length, 0, 'an ambiguous result never fetches a detail');
  });
});

describe('enrichGame — outcomes', () => {
  test('nothing passes → no-match, attempt recorded', async () => {
    const providers = fakeProviderSet({ steamSearch: { search: { 'Portal 2': [searchHit('steam', '1', 'Portal')] } } });
    const { Game, deps } = setup({ providers });
    const { outcome } = await enrichGame(ref(), deps);
    assert.equal(outcome, 'no-match');
    const e = Game.get(ref()._id).enrichment;
    assert.equal(e.status, 'no-match');
    assert.equal(e.attempts, 1);
    assert.deepEqual(e.providersTried, ['steam']);
    assert.equal(Game.get(ref()._id).description, '');
  });

  test('two pass → ambiguous (not no-match), nothing written', async () => {
    const providers = fakeProviderSet({
      steamSearch: { search: { 'Portal 2': [searchHit('steam', '1', 'Portal 2'), searchHit('steam', '2', 'PORTAL 2')] } },
    });
    const { Game, deps } = setup({ providers });
    assert.equal((await enrichGame(ref(), deps)).outcome, 'ambiguous');
    assert.equal(Game.get(ref()._id).enrichment.status, 'ambiguous');
    assert.equal(Game.get(ref()._id).developers.length, 0);
  });

  test('a provider failure with no match → error, attempts count up, message has no key', async () => {
    const err = new Error('RAWG request failed: 500 https://api.rawg.io/api/games?search=x&key=SECRET');
    const providers = fakeProviderSet({ rawg: { configured: true, throws: err } });
    const { Game, deps } = setup({ providers });
    await enrichGame(ref(), deps);
    await enrichGame(ref(), deps, { mode: 'refresh' });
    const e = Game.get(ref()._id).enrichment;
    assert.equal(e.status, 'error');
    assert.equal(e.attempts, 2);
    assert.match(e.error, /^rawg: RAWG request failed: 500/);
    assert.equal(e.error.includes('SECRET'), false);
  });

  test('a failure followed by a match → matched', async () => {
    const providers = fakeProviderSet({
      igdb: { configured: true, throws: new Error('IGDB games failed: 503') },
      steamSearch: { search: { 'Portal 2': [searchHit('steam', '620', 'Portal 2')] }, details: { 620: detailOf('steam', '620', 'Portal 2') } },
    });
    const { deps } = setup({ providers });
    assert.equal((await enrichGame(ref(), deps)).outcome, 'matched');
  });

  test('the detail’s year can still veto a title match the search had no year for', async () => {
    const providers = fakeProviderSet({
      steamSearch: {
        search: { 'Portal 2': [searchHit('steam', '9', 'Portal 2')] },
        details: { 9: detailOf('steam', '9', 'Portal 2', { releaseDate: '2005-01-01T00:00:00.000Z' }) },
      },
    });
    const { deps } = setup({ games: [baseGame({ releaseDate: new Date('2011-04-18T00:00:00Z') })], providers });
    assert.equal((await enrichGame(ref(), deps)).outcome, 'no-match');
  });

  test('the worker leaves unlinked, matched and manual games alone; a refresh may run them', async () => {
    const providers = fakeProviderSet({
      steamSearch: { search: { 'Portal 2': [searchHit('steam', '620', 'Portal 2')] }, details: { 620: detailOf('steam', '620', 'Portal 2') } },
    });
    for (const enrichment of [{ status: 'unlinked' }, { status: 'matched' }, { status: 'pending', manual: true }]) {
      const { deps } = setup({ games: [baseGame({ enrichment })], providers });
      assert.equal((await enrichGame(ref(), deps)).outcome, 'skipped', JSON.stringify(enrichment));
    }
    const { deps } = setup({ games: [baseGame({ enrichment: { status: 'unlinked' } })], providers });
    assert.equal((await enrichGame(ref(), deps, { mode: 'refresh' })).outcome, 'matched');
  });

  test('a game in another household is invisible', async () => {
    const { deps } = setup();
    assert.equal((await enrichGame({ _id: ref()._id, householdId: 'other' }, deps)).outcome, 'missing');
  });
});

describe('enrichGame — writes', () => {
  const steamMatch = () =>
    fakeProviderSet({
      steamSearch: {
        search: { 'Portal 2': [searchHit('steam', '620', 'Portal 2')] },
        details: { 620: detailOf('steam', '620', 'Portal 2', { platforms: ['pc', 'linux'] }) },
      },
    });

  test('fills empty fields, the cover, and a full matched record', async () => {
    const { Game, deps, coverCalls } = setup({ providers: steamMatch() });
    await enrichGame(ref(), deps);
    const g = Game.get(ref()._id);
    assert.equal(g.description, 'About Portal 2.');
    assert.equal(g.coverPath, 'aaaaaaaaaaaaaaaaaaaaaaa1.jpg');
    assert.deepEqual(g.platformsAvailable, ['pc', 'linux']);
    assert.equal(g.externalIds.steamAppId, '620');
    assert.deepEqual(coverCalls.write, ['aaaaaaaaaaaaaaaaaaaaaaa1.jpg']);
    const e = g.enrichment;
    assert.equal(e.status, 'matched');
    assert.equal(e.providerId, '620');
    assert.equal(e.matchedTitle, 'Portal 2');
    assert.equal(e.coverFromEnrichment, true);
    assert.ok(e.filled.includes('coverPath') && e.filled.includes('description') && e.filled.includes('platformsAvailable'));
    assert.deepEqual(e.addedPlatforms, ['linux']);
    assert.ok(e.filledHashes.description);
    assert.equal(e.title, undefined);
  });

  test('a game that already has a cover keeps it; no download', async () => {
    const { Game, deps, coverCalls } = setup({ games: [baseGame({ coverPath: 'mine.png' })], providers: steamMatch() });
    await enrichGame(ref(), deps);
    assert.equal(Game.get(ref()._id).coverPath, 'mine.png');
    assert.equal(coverCalls.fetch.length, 0);
    assert.equal(Game.get(ref()._id).enrichment.coverFromEnrichment, false);
  });

  test('a field filled concurrently (between read and write) is never overwritten', async () => {
    let first = true;
    const hooks = {
      beforeUpdate: (filter, update, fake) => {
        if (!first) return;
        first = false;
        fake.touch(ref()._id, (d) => {
          d.description = 'Typed by a person meanwhile.';
        });
      },
    };
    const { Game, deps } = setup({ providers: steamMatch(), hooks });
    await enrichGame(ref(), deps);
    const g = Game.get(ref()._id);
    assert.equal(g.description, 'Typed by a person meanwhile.');
    assert.equal(g.developers[0], 'Dev Co');
    assert.equal(g.enrichment.filled.includes('description'), false);
    assert.equal(Game.calls.updateOne.length, 2, 'one lock miss, one re-planned write');
  });

  test('each filled field is guarded empty in the write filter itself', async () => {
    const { Game, deps } = setup({ providers: steamMatch() });
    await enrichGame(ref(), deps);
    const { filter } = Game.calls.updateOne[0];
    assert.deepEqual(filter.description, { $in: [null, ''] });
    assert.deepEqual(filter['developers.0'], { $exists: false });
    assert.equal(filter.coverPath, null);
    assert.ok('updatedAt' in filter);
  });

  test('an external id another household game holds is not taken', async () => {
    const other = baseGame({ _id: 'aaaaaaaaaaaaaaaaaaaaaaa2', title: 'Portal 2 (dupe)', externalIds: { steamAppId: '620' } });
    const { Game, deps } = setup({ games: [baseGame(), other], providers: steamMatch() });
    await enrichGame(ref(), deps);
    const g = Game.get(ref()._id);
    assert.equal(g.externalIds.steamAppId, null);
    assert.equal(g.enrichment.status, 'matched');
  });

  test('an external id taken in a race (E11000) is dropped on retry', async () => {
    let first = true;
    const hooks = {
      beforeUpdate: (filter, update, fake) => {
        if (!first) return;
        first = false;
        fake.docs.push(baseGame({ _id: 'aaaaaaaaaaaaaaaaaaaaaaa3', externalIds: { steamAppId: '620' } }));
      },
    };
    const { Game, deps } = setup({ providers: steamMatch(), hooks });
    await enrichGame(ref(), deps);
    const g = Game.get(ref()._id);
    assert.equal(g.enrichment.status, 'matched');
    assert.equal(g.externalIds.steamAppId, null);
  });
});

describe('applyCandidate', () => {
  test('an unconfigured provider is refused', async () => {
    const { deps } = setup();
    assert.deepEqual(await applyCandidate(ref(), { provider: 'igdb', providerId: '1' }, deps), { error: 'provider-unavailable' });
  });

  test('applies with fill-only-empty, status matched, manual', async () => {
    const providers = fakeProviderSet({ steamSearch: { details: { 70: detailOf('steam', '70', 'Half-Life') } } });
    const { Game, deps } = setup({ games: [baseGame({ developers: ['Mine'], enrichment: { status: 'no-match', attempts: 1 } })], providers });
    const { enrichment } = await applyCandidate(ref(), { provider: 'steam', providerId: '70' }, deps);
    assert.equal(enrichment.status, 'matched');
    assert.equal(enrichment.manual, true);
    const g = Game.get(ref()._id);
    assert.deepEqual(g.developers, ['Mine']);
    assert.equal(g.enrichment.matchedTitle, 'Half-Life');
  });

  test('a candidate the provider no longer has', async () => {
    const { deps } = setup();
    assert.deepEqual(await applyCandidate(ref(), { provider: 'steam', providerId: '404' }, deps), { error: 'candidate-not-found' });
  });
});

describe('unlinkGame', () => {
  const providers = () =>
    fakeProviderSet({
      steamSearch: {
        search: { 'Portal 2': [searchHit('steam', '620', 'Portal 2')] },
        details: { 620: detailOf('steam', '620', 'Portal 2', { platforms: ['pc', 'mac'] }) },
      },
    });

  test('clears exactly the fields enrichment filled and still holds; deletes its cover; parks the game', async () => {
    const { Game, deps, coverCalls } = setup({ games: [baseGame({ genres: ['Puzzle'] })], providers: providers() });
    await enrichGame(ref(), deps);
    // A person edits one filled field after the match.
    Game.touch(ref()._id, (d) => {
      d.description = 'Edited by me.';
    });
    const { enrichment, cleared, kept } = await unlinkGame(ref(), deps);
    const g = Game.get(ref()._id);
    assert.equal(enrichment.status, 'unlinked');
    assert.equal(g.enrichment.status, 'unlinked');
    assert.equal(g.enrichment.provider, null);
    assert.deepEqual(g.enrichment.filled, []);
    assert.deepEqual(kept, ['description']);
    assert.ok(cleared.includes('developers') && cleared.includes('coverPath') && cleared.includes('externalIds.steamAppId'));
    assert.equal(g.description, 'Edited by me.');
    assert.deepEqual(g.developers, []);
    assert.deepEqual(g.genres, ['Puzzle'], 'a field that was never filled is untouched');
    assert.equal(g.externalIds.steamAppId, null);
    assert.equal(g.coverPath, null);
    assert.deepEqual(g.platformsAvailable, ['pc']);
    assert.deepEqual(coverCalls.delete, ['aaaaaaaaaaaaaaaaaaaaaaa1.jpg']);
  });

  test('a cover the person replaced after the match survives the unlink', async () => {
    const { Game, deps, coverCalls } = setup({ providers: providers() });
    await enrichGame(ref(), deps);
    Game.touch(ref()._id, (d) => {
      d.enrichment.coverFromEnrichment = false; // what coverRoutes does on upload
    });
    await unlinkGame(ref(), deps);
    assert.equal(Game.get(ref()._id).coverPath, 'aaaaaaaaaaaaaaaaaaaaaaa1.jpg');
    assert.equal(coverCalls.delete.length, 0);
  });

  test('the worker never re-matches an unlinked game', async () => {
    const { deps } = setup({ providers: providers() });
    await enrichGame(ref(), deps);
    await unlinkGame(ref(), deps);
    assert.equal((await enrichGame(ref(), deps)).outcome, 'skipped');
  });
});

describe('listCandidates', () => {
  test('every configured provider, unfiltered, with wouldMatch from the strict matcher', async () => {
    const providers = fakeProviderSet({
      igdb: { configured: true, search: { 'Portal 2': [searchHit('igdb', '1020', 'Portal 2', '2011-04-18T00:00:00.000Z'), searchHit('igdb', '71', 'Portal')] } },
      steamSearch: { search: { 'Portal 2': [searchHit('steam', '620', 'Portal 2'), searchHit('steam', '621', 'Portal 2 Soundtrack')] } },
    });
    const { deps } = setup({ providers });
    const { candidates, errors } = await listCandidates({ title: 'Portal 2', releaseDate: null }, deps);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      candidates.map((c) => [c.provider, c.providerId, c.wouldMatch]),
      [
        ['igdb', '1020', true],
        ['igdb', '71', false],
        ['steam', '620', true],
        ['steam', '621', false],
      ]
    );
    assert.equal(candidates[0].year, 2011);
    assert.deepEqual(Object.keys(candidates[0]).sort(), ['coverUrl', 'platforms', 'provider', 'providerId', 'title', 'wouldMatch', 'year']);
  });

  test('a failing provider is reported, the rest still answer', async () => {
    const providers = fakeProviderSet({ igdb: { configured: true, throws: new Error('boom') } });
    const { deps } = setup({ providers });
    const { errors } = await listCandidates({ title: 'X' }, deps);
    assert.deepEqual(errors, [{ provider: 'igdb', message: 'Provider unavailable' }]);
  });
});

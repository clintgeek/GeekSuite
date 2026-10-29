/**
 * The media mappers (src/metadata/media.js) against recorded provider bodies:
 * steam-appdetails-media.json is a trimmed copy of the live Hollow Knight
 * (367520) response taken 2026-10-29; igdb-media.json is an IGDB /games row
 * in the shape IGDB_MEDIA_FIELDS asks for.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  normalizeSteamMedia,
  normalizeIgdbMedia,
  rawgSlug,
  buildMediaLinks,
  mergeMedia,
  safeUrl,
  IGDB_MEDIA_FIELDS,
} from '../src/metadata/media.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const steamFixture = load('steam-appdetails-media.json');
const igdbFixture = load('igdb-media.json');

describe('normalizeSteamMedia', () => {
  test('screenshots: thumbnail + full, tagged steam', () => {
    const { screenshots } = normalizeSteamMedia('367520', steamFixture);
    assert.equal(screenshots.length, 3);
    assert.match(screenshots[0].thumb, /^https:\/\/shared\.akamai\.steamstatic\.com\/.+\.600x338\.jpg/);
    assert.match(screenshots[0].full, /\.1920x1080\.jpg/);
    assert.equal(screenshots[0].source, 'steam');
  });

  test('movies: highlight first, HLS source, store page fallback, no mp4 in the current shape', () => {
    const { videos } = normalizeSteamMedia('367520', steamFixture);
    assert.equal(videos.length, 2);
    assert.equal(videos[0].title, 'Release Trailer');
    assert.equal(videos[0].kind, 'steam');
    assert.match(videos[0].hls, /^https:\/\/video\.akamai\.steamstatic\.com\/.+\.m3u8/);
    assert.match(videos[0].thumb, /movie\.293x165\.jpg/);
    assert.equal(videos[0].mp4, null);
    assert.equal(videos[0].url, 'https://store.steampowered.com/app/367520/');
  });

  test('a legacy mp4 movie still maps (max preferred over 480)', () => {
    const raw = { 1: { success: true, data: { movies: [{ name: 'Old', thumbnail: 'https://cdn.akamai.steamstatic.com/t.jpg', mp4: { 480: 'https://cdn.akamai.steamstatic.com/a.mp4', max: 'https://cdn.akamai.steamstatic.com/b.mp4' } }] } } };
    const [v] = normalizeSteamMedia('1', raw).videos;
    assert.equal(v.mp4, 'https://cdn.akamai.steamstatic.com/b.mp4');
    assert.equal(v.hls, null);
  });

  test('the keyed-by-another-id quirk is found by steam_appid', () => {
    const raw = { 323180: { success: true, data: { steam_appid: 620, screenshots: [{ path_full: 'https://cdn.akamai.steamstatic.com/s.jpg' }] } } };
    assert.equal(normalizeSteamMedia('620', raw).screenshots.length, 1);
  });

  test('hostile or unexpected URLs are dropped, not passed through', () => {
    const raw = {
      9: {
        success: true,
        data: {
          screenshots: [
            { path_full: 'javascript:alert(1)' },
            { path_full: 'http://cdn.akamai.steamstatic.com/plain-http.jpg' },
            { path_full: 'https://evil.example.com/x.jpg' },
            { path_full: 'https://steamstatic.com.evil.example/x.jpg' },
            { path_full: 'https://cdn.akamai.steamstatic.com/ok.jpg' },
          ],
        },
      },
    };
    const shots = normalizeSteamMedia('9', raw).screenshots;
    assert.deepEqual(shots.map((s) => s.full), ['https://cdn.akamai.steamstatic.com/ok.jpg']);
    assert.equal(shots[0].thumb, shots[0].full); // no thumbnail → the full image
  });

  test('success:false or garbage → empty, never a throw', () => {
    assert.deepEqual(normalizeSteamMedia('1', { 1: { success: false } }), { screenshots: [], videos: [] });
    assert.deepEqual(normalizeSteamMedia('1', null), { screenshots: [], videos: [] });
    assert.deepEqual(normalizeSteamMedia('1', 'nope'), { screenshots: [], videos: [] });
  });
});

describe('normalizeIgdbMedia', () => {
  const media = normalizeIgdbMedia(igdbFixture[0]);

  test('the page URL is the slug URL IGDB returns', () => {
    assert.equal(media.url, 'https://www.igdb.com/games/hollow-knight');
  });

  test('screenshots then artworks, deduped by image_id, sized for strip and viewer', () => {
    assert.deepEqual(
      media.screenshots.map((s) => s.thumb),
      [
        'https://images.igdb.com/igdb/image/upload/t_screenshot_med/wtzarvdnr6mgg3irdnz2.jpg',
        'https://images.igdb.com/igdb/image/upload/t_screenshot_med/rbu4dazhkdr5mkkd0qyt.jpg',
        'https://images.igdb.com/igdb/image/upload/t_screenshot_med/ar4ck.jpg',
      ],
    );
    assert.equal(media.screenshots[0].full, 'https://images.igdb.com/igdb/image/upload/t_1080p/wtzarvdnr6mgg3irdnz2.jpg');
    assert.equal(media.screenshots[0].source, 'igdb');
  });

  test('videos are YouTube ids; a malformed id is dropped', () => {
    assert.deepEqual(media.videos, [
      { kind: 'youtube', title: 'Trailer', youtubeId: 'UAO2urG23S4', thumb: 'https://i.ytimg.com/vi/UAO2urG23S4/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=UAO2urG23S4' },
    ]);
  });

  test('a URL off igdb.com is not trusted as the page link', () => {
    assert.equal(normalizeIgdbMedia({ url: 'https://evil.example/games/x' }).url, null);
  });

  test('null row → empty', () => {
    assert.deepEqual(normalizeIgdbMedia(null), { url: null, screenshots: [], videos: [] });
  });

  test('the fields list asks for exactly what the mapper reads', () => {
    for (const f of ['url', 'screenshots.image_id', 'artworks.image_id', 'videos.video_id', 'videos.name']) {
      assert.ok(IGDB_MEDIA_FIELDS.split(',').includes(f), f);
    }
  });
});

describe('rawgSlug / buildMediaLinks / mergeMedia / safeUrl', () => {
  test('RAWG slug from the detail body; junk slugs refused', () => {
    assert.equal(rawgSlug(load('rawg-detail.json')), 'hades-2');
    assert.equal(rawgSlug({ slug: '../../x' }), null);
    assert.equal(rawgSlug(null), null);
  });

  test('links: Steam from the id alone; IGDB and RAWG only with their fetched URL/slug', () => {
    assert.deepEqual(buildMediaLinks({ steamAppId: '367520', igdb: '14593', rawg: '9767' }), [
      { kind: 'steam', label: 'Steam store', url: 'https://store.steampowered.com/app/367520/' },
    ]);
    assert.deepEqual(
      buildMediaLinks({ steamAppId: '367520', igdb: '14593', rawg: '9767' }, { igdbUrl: 'https://www.igdb.com/games/hollow-knight', rawgSlug: 'hollow-knight' }).map((l) => l.url),
      ['https://store.steampowered.com/app/367520/', 'https://www.igdb.com/games/hollow-knight', 'https://rawg.io/games/hollow-knight'],
    );
    assert.deepEqual(buildMediaLinks({ steamAppId: 'abc' }), []);
  });

  test('Steam wins when it has screenshots; IGDB fills when it has none', () => {
    const steam = normalizeSteamMedia('367520', steamFixture);
    const igdb = normalizeIgdbMedia(igdbFixture[0]);
    const both = mergeMedia({ steam, igdb });
    assert.equal(both.source, 'steam');
    assert.ok(both.screenshots.every((s) => s.source === 'steam'));
    assert.equal(both.videos[0].kind, 'steam');

    const igdbOnly = mergeMedia({ steam: { screenshots: [], videos: [] }, igdb });
    assert.equal(igdbOnly.source, 'igdb');
    assert.equal(igdbOnly.screenshots.length, 3);
    assert.equal(igdbOnly.videos[0].kind, 'youtube');

    const mixed = mergeMedia({ steam: { screenshots: steam.screenshots, videos: [] }, igdb });
    assert.equal(mixed.videos[0].kind, 'youtube'); // Steam had shots but no trailer

    assert.deepEqual(mergeMedia({}), { screenshots: [], videos: [], source: null });
  });

  test('safeUrl: https and a passing host only', () => {
    assert.equal(safeUrl('https://a.b/c', () => true), 'https://a.b/c');
    assert.equal(safeUrl('http://a.b/c', () => true), null);
    assert.equal(safeUrl('not a url', () => true), null);
    assert.equal(safeUrl('https://a.b/c', () => false), null);
  });
});

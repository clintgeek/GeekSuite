import { describe, expect, it } from 'vitest';
import { buildGameLinks, inlineVideoSource, mediaItems } from '../../utils/gameMedia';

const game = (externalIds, title = 'Hollow Knight') => ({ title, externalIds });
const kinds = (links) => links.map((l) => l.kind);

describe('buildGameLinks', () => {
  it('a Steam game: the store page and a trailer search, no "Search on Steam"', () => {
    const links = buildGameLinks(game({ steamAppId: '367520' }));
    expect(links).toEqual([
      { kind: 'steam', label: 'Steam store', url: 'https://store.steampowered.com/app/367520/' },
      { kind: 'trailer-search', label: 'Watch a trailer', url: 'https://www.youtube.com/results?search_query=Hollow%20Knight%20trailer' },
    ]);
  });

  it('a game with no store id: both searches, nothing else', () => {
    const links = buildGameLinks(game(null, 'Disco Elysium — The Final Cut'));
    expect(kinds(links)).toEqual(['trailer-search', 'steam-search']);
    expect(links[1].url).toBe('https://store.steampowered.com/search/?term=Disco%20Elysium%20%E2%80%94%20The%20Final%20Cut');
  });

  it('IGDB: a title search until the server sends the real page, then the page', () => {
    const before = buildGameLinks(game({ igdb: '14593' }));
    expect(before.find((l) => l.kind === 'igdb').url).toBe('https://www.igdb.com/search?type=1&q=Hollow%20Knight');
    const after = buildGameLinks(game({ igdb: '14593' }), { links: [{ kind: 'igdb', url: 'https://www.igdb.com/games/hollow-knight' }] });
    expect(after.find((l) => l.kind === 'igdb').url).toBe('https://www.igdb.com/games/hollow-knight');
  });

  it('RAWG only once the server has its slug; an off-host URL is ignored', () => {
    expect(kinds(buildGameLinks(game({ rawg: '9767' })))).not.toContain('rawg');
    expect(buildGameLinks(game({ rawg: '9767' }), { links: [{ kind: 'rawg', url: 'https://rawg.io/games/hollow-knight' }] }).find((l) => l.kind === 'rawg').url).toBe(
      'https://rawg.io/games/hollow-knight',
    );
    expect(kinds(buildGameLinks(game({ rawg: '9767' }), { links: [{ kind: 'rawg', url: 'javascript:alert(1)' }] }))).not.toContain('rawg');
  });

  it('the full set, in order', () => {
    const links = buildGameLinks(game({ steamAppId: '367520', igdb: '1', rawg: '2', gog: 'hollow_knight' }), {
      links: [{ kind: 'igdb', url: 'https://www.igdb.com/games/hollow-knight' }, { kind: 'rawg', url: 'https://rawg.io/games/hollow-knight' }],
    });
    expect(kinds(links)).toEqual(['steam', 'gog', 'igdb', 'rawg', 'trailer-search']);
  });

  it('a non-numeric Steam id is not a Steam id', () => {
    expect(kinds(buildGameLinks(game({ steamAppId: '../x' })))).toEqual(['trailer-search', 'steam-search']);
  });
});

describe('mediaItems', () => {
  const media = {
    screenshots: [{ thumb: 't1', full: 'f1' }, { thumb: 't2', full: 'f2' }],
    videos: [{ kind: 'steam', title: 'Launch', thumb: 'v1' }, { kind: 'youtube', title: 'Gameplay', thumb: 'v2', url: 'u' }],
  };

  it('lead trailer first, then screenshots, then the other trailers; alt text numbers screenshots', () => {
    const items = mediaItems(media, 'Hades');
    expect(items.map((i) => i.type)).toEqual(['video', 'screenshot', 'screenshot', 'video']);
    expect(items[1].label).toBe('Hades screenshot 1');
    expect(items[2].label).toBe('Hades screenshot 2');
    expect(items[0].label).toBe('Hades trailer: Launch');
  });

  it('nothing in, nothing out', () => {
    expect(mediaItems(null)).toEqual([]);
    expect(mediaItems({})).toEqual([]);
  });
});

describe('inlineVideoSource', () => {
  it('mp4 always plays inline; HLS only where the browser can; YouTube never', () => {
    expect(inlineVideoSource({ type: 'video', kind: 'steam', mp4: 'a.mp4' }, false)).toEqual({ src: 'a.mp4', type: 'video/mp4' });
    expect(inlineVideoSource({ type: 'video', kind: 'steam', hls: 'a.m3u8' }, true)).toEqual({ src: 'a.m3u8', type: 'application/vnd.apple.mpegurl' });
    expect(inlineVideoSource({ type: 'video', kind: 'steam', hls: 'a.m3u8' }, false)).toBeNull();
    expect(inlineVideoSource({ type: 'video', kind: 'youtube', url: 'u' }, true)).toBeNull();
  });
});

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import MediaSection from '../../views/detail/MediaSection';
import { useGameMedia } from '../../hooks/useGameMedia';
import { renderWithProviders } from '../testUtils';

const GAME = { id: 'g1', title: 'Hollow Knight', externalIds: { steamAppId: '367520', igdb: '14593' } };
const SHOTS = Array.from({ length: 3 }, (_, i) => ({ thumb: `https://cdn.akamai.steamstatic.com/t${i}.jpg`, full: `https://cdn.akamai.steamstatic.com/f${i}.jpg`, source: 'steam' }));
const MEDIA = {
  links: [{ kind: 'igdb', label: 'IGDB', url: 'https://www.igdb.com/games/hollow-knight' }],
  screenshots: SHOTS,
  videos: [{ kind: 'youtube', title: 'Launch Trailer', youtubeId: 'abcdefghijk', thumb: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=abcdefghijk' }],
};

const render = (props) => renderWithProviders(<MediaSection game={GAME} {...props} />);

describe('MediaSection — states', () => {
  it('loading: skeleton tiles, and the links are already there', () => {
    render({ status: 'loading', media: { links: [], screenshots: [], videos: [] } });
    expect(screen.getByTestId('media-loading')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Media' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Steam store/ })).toHaveAttribute('href', 'https://store.steampowered.com/app/367520/');
  });

  it('ready: a strip with the trailer first and numbered screenshot alt text', () => {
    render({ status: 'ready', media: MEDIA });
    const strip = screen.getByTestId('media-strip');
    const tiles = within(strip).getAllByTestId('media-tile');
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toHaveAccessibleName('Play Hollow Knight trailer: Launch Trailer');
    expect(within(strip).getByAltText('Hollow Knight screenshot 3')).toHaveAttribute('src', SHOTS[2].thumb);
    expect(screen.getByRole('link', { name: /IGDB/ })).toHaveAttribute('href', 'https://www.igdb.com/games/hollow-knight');
  });

  it('every link opens in a new tab without an opener', () => {
    render({ status: 'ready', media: MEDIA });
    for (const link of within(screen.getByTestId('game-links')).getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('no media: the section becomes just the links', () => {
    render({ status: 'ready', media: { links: [], screenshots: [], videos: [] } });
    expect(screen.getByRole('heading', { name: 'Links' })).toBeInTheDocument();
    expect(screen.queryByTestId('media-strip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('media-loading')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Watch a trailer/ })).toBeInTheDocument();
  });

  it('error: one quiet line, no raw error text, links still there', () => {
    render({ status: 'error', media: { links: [], screenshots: [], videos: [] } });
    expect(screen.getByTestId('media-error')).toHaveTextContent("Couldn't load screenshots.");
    expect(screen.getByRole('link', { name: /Steam store/ })).toBeInTheDocument();
  });

  it('tapping a screenshot opens the viewer on that one', async () => {
    render({ status: 'ready', media: MEDIA });
    fireEvent.click(screen.getByAltText('Hollow Knight screenshot 2'));
    const viewer = await screen.findByTestId('media-viewer');
    expect(within(viewer).getByTestId('viewer-index')).toHaveTextContent('3 of 4');
    expect(within(viewer).getByTestId('viewer-image')).toHaveAttribute('src', SHOTS[1].full);
  });
});

describe('useGameMedia', () => {
  afterEach(() => vi.unstubAllGlobals());

  function Probe({ id }) {
    const { status, media } = useGameMedia(id);
    return <p data-testid="probe">{`${status}:${media.screenshots.length}`}</p>;
  }

  const respond = (body, status = 200) =>
    vi.fn(async () => ({ ok: status < 400, status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body }));

  it('loading → ready, from GET /api/games/:id/media', async () => {
    const fetchMock = respond({ ...MEDIA, errors: [] });
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<Probe id="g1" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('loading:0');
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready:3'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/games/g1/media');
  });

  it('a partial answer with media is still ready', async () => {
    vi.stubGlobal('fetch', respond({ ...MEDIA, partial: true, errors: ['igdb'] }));
    renderWithProviders(<Probe id="g1" />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready:3'));
  });

  it('nothing arrived and a provider failed → error; a 502 → error', async () => {
    vi.stubGlobal('fetch', respond({ links: [], screenshots: [], videos: [], errors: ['steam'] }));
    const { unmount } = renderWithProviders(<Probe id="g1" />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('error:0'));
    unmount();

    vi.stubGlobal('fetch', respond({ message: 'Media unavailable' }, 502));
    renderWithProviders(<Probe id="g2" />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('error:0'));
  });

  it('no media and no failure is ready (empty), not an error', async () => {
    vi.stubGlobal('fetch', respond({ links: [], screenshots: [], videos: [], errors: [] }));
    renderWithProviders(<Probe id="g1" />);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('ready:0'));
  });

  it('closing the page aborts the request', async () => {
    let signal;
    vi.stubGlobal('fetch', vi.fn((url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    }));
    const { unmount } = renderWithProviders(<Probe id="g1" />);
    await act(async () => {});
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

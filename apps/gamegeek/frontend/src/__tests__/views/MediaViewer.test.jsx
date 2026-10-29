import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import MediaViewer from '../../views/detail/MediaViewer';
import { mediaItems } from '../../utils/gameMedia';
import { renderWithProviders } from '../testUtils';

const MEDIA = {
  screenshots: [1, 2, 3].map((n) => ({ thumb: `https://x/t${n}.jpg`, full: `https://x/f${n}.jpg` })),
  videos: [
    { kind: 'steam', title: 'Release Trailer', thumb: 'https://x/v.jpg', hls: 'https://x/v.m3u8', mp4: null, url: 'https://store.steampowered.com/app/1/' },
    { kind: 'youtube', title: 'Gameplay', youtubeId: 'abcdefghijk', thumb: 'https://x/y.jpg', url: 'https://www.youtube.com/watch?v=abcdefghijk' },
  ],
};
const ITEMS = mediaItems(MEDIA, 'Hades'); // [steam video, s1, s2, s3, youtube]

function Harness({ start = 1, onClose = () => {} }) {
  const [index, setIndex] = useState(start);
  const [open, setOpen] = useState(true);
  return (
    <MediaViewer
      open={open}
      items={ITEMS}
      index={index}
      onIndexChange={setIndex}
      onClose={() => {
        setOpen(false);
        onClose();
      }}
    />
  );
}

const viewer = () => screen.getByTestId('media-viewer');
const index = () => within(viewer()).getByTestId('viewer-index');

describe('MediaViewer — navigation', () => {
  it('shows "n of N" and the full-size image with its alt text', () => {
    renderWithProviders(<Harness start={2} />);
    expect(index()).toHaveTextContent('3 of 5');
    expect(within(viewer()).getByAltText('Hades screenshot 2')).toHaveAttribute('src', 'https://x/f2.jpg');
  });

  it('Next / Previous buttons move, and stop at the ends', () => {
    renderWithProviders(<Harness start={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(index()).toHaveTextContent('5 of 5');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(index()).toHaveTextContent('4 of 5');
  });

  it('arrow keys move', () => {
    renderWithProviders(<Harness start={1} />);
    fireEvent.keyDown(viewer(), { key: 'ArrowRight' });
    expect(index()).toHaveTextContent('3 of 5');
    fireEvent.keyDown(viewer(), { key: 'ArrowLeft' });
    fireEvent.keyDown(viewer(), { key: 'ArrowLeft' });
    expect(index()).toHaveTextContent('1 of 5');
    fireEvent.keyDown(viewer(), { key: 'ArrowLeft' });
    expect(index()).toHaveTextContent('1 of 5');
  });

  it('a horizontal swipe moves; a vertical one does not', () => {
    renderWithProviders(<Harness start={1} />);
    const stage = within(viewer()).getByAltText('Hades screenshot 1').parentElement;
    fireEvent.touchStart(stage, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(stage, { changedTouches: [{ clientX: 120, clientY: 410 }] });
    expect(index()).toHaveTextContent('3 of 5');
    const stage2 = within(viewer()).getByAltText('Hades screenshot 2').parentElement;
    fireEvent.touchStart(stage2, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(stage2, { changedTouches: [{ clientX: 140, clientY: 500 }] });
    expect(index()).toHaveTextContent('3 of 5');
    fireEvent.touchStart(stage2, { touches: [{ clientX: 100, clientY: 400 }] });
    fireEvent.touchEnd(stage2, { changedTouches: [{ clientX: 300, clientY: 400 }] });
    expect(index()).toHaveTextContent('2 of 5');
  });

  it('the close button closes', () => {
    const onClose = vi.fn();
    renderWithProviders(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Android back (popstate) closes the viewer, not the page', async () => {
    const onClose = vi.fn();
    const before = window.history.state?.ggLayers?.length ?? 0;
    renderWithProviders(<Harness onClose={onClose} />);
    expect(window.history.state?.ggLayers?.length).toBe(before + 1); // the viewer owns one entry
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a YouTube trailer links out to YouTube; a Steam HLS trailer with no HLS support links to Steam', () => {
    renderWithProviders(<Harness start={4} />);
    expect(within(viewer()).getByTestId('viewer-watch-out')).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdefghijk');
    expect(within(viewer()).getByTestId('viewer-watch-out')).toHaveTextContent('Watch on YouTube');
    for (let i = 0; i < 4; i += 1) fireEvent.keyDown(viewer(), { key: 'ArrowLeft' });
    // jsdom's canPlayType says '' — the "can't play HLS" browser.
    expect(within(viewer()).getByTestId('viewer-watch-out')).toHaveAttribute('href', 'https://store.steampowered.com/app/1/');
  });

  it('a Steam trailer plays inline where HLS is supported — controls, poster, no autoplay', () => {
    const spy = vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    renderWithProviders(<Harness start={0} />);
    const video = within(viewer()).getByTestId('viewer-video');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('poster', 'https://x/v.jpg');
    expect(video).not.toHaveAttribute('autoplay');
    expect(video.querySelector('source')).toHaveAttribute('src', 'https://x/v.m3u8');
    spy.mockRestore();
  });
});

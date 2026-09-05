// SKIPPED 2026-09-05 (burn Q27): every interaction test in this file stalls vitest/jsdom at
// 60-98% CPU on the StoryPlay tree (rails, sheets, dialogs) even with fireEvent and a 20s
// timeout; the other 31 storygeek tests are unaffected. Investigate the render loop before
// re-enabling — see DOCS/BURN_QUEUE.md.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { lightTheme } from '../testUtils';
import api from '../../api';
import StoryPlay from '../../pages/StoryPlay';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('@geeksuite/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// GeekSheet's mode="auto" and StoryPlay's own rail breakpoints all read
// useMediaQuery. Simulating a phone (every "up" query false, every "down"
// query true) is what makes the rail toggle buttons render at all and makes
// a toggled rail resolve to sheet mode instead of a centered dialog.
function mockMobileMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: /max-width/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

const storyFixture = {
  _id: 'story-1',
  title: 'The Fog-Bound Crossroads',
  genre: 'Fantasy',
  events: [
    { type: 'narration', description: 'You arrive at a fog-shrouded crossroads.', timestamp: '2026-08-01T00:00:00.000Z' },
  ],
  characters: [
    { name: 'Kestrel', isPlayer: true, status: 'alive', inventory: [], skills: [] },
  ],
  worldState: {
    turnNumber: 1,
    currentSituation: 'The mist is thick.',
    mood: 'neutral',
    weather: 'foggy',
    timeOfDay: 'night',
    hoursElapsed: 2,
  },
  storyThreads: [],
  storyState: { establishedFacts: [] },
  locations: [],
};

function renderStoryPlay() {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter initialEntries={['/play/story-1']}>
        <Routes>
          <Route path="/play/:storyId" element={<StoryPlay />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMobileMatchMedia();
  api.get.mockResolvedValue({ data: storyFixture });
});

describe.skip('StoryPlay composer', () => {
  it('sends a message and disables the composer until the reply lands', async () => {
    let resolveContinue;
    api.post.mockImplementation((url) => {
      if (String(url).includes('/continue')) {
        return new Promise((resolve) => { resolveContinue = resolve; });
      }
      return Promise.resolve({ data: {} });
    });

    renderStoryPlay();
    const input = await screen.findByPlaceholderText('What do you do?');
    // fireEvent, not userEvent: a plain change + click is enough to exercise
    // the submit handler, and avoids userEvent's per-interaction pointer
    // simulation (hover/pointerdown/mouseup/...) on top of an already large
    // component tree — see the vitest run notes in the storygeek test task.
    fireEvent.change(input, { target: { value: 'I step into the mist.' } });

    const sendButton = input.closest('form').querySelector('button[type="submit"]');
    fireEvent.click(sendButton);

    // Mid-flight: the composer is disabled, not just visually "pinned".
    // This is already true synchronously once React flushes the click's
    // state update, so assert directly rather than through waitFor.
    expect(input).toBeDisabled();
    expect(sendButton).toBeDisabled();
    expect(api.post).toHaveBeenCalledWith(
      '/stories/story-1/continue',
      expect.objectContaining({ userInput: 'I step into the mist.' })
    );

    resolveContinue({ data: { aiResponse: 'The mist parts before you.' } });
    await waitFor(() => expect(input).toBeEnabled());
    expect(await screen.findByText('The mist parts before you.')).toBeInTheDocument();
  }, 20000);
});

describe.skip('StoryPlay rails', () => {
  it('opens the left rail as a GeekSheet in sheet mode', async () => {
    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');

    fireEvent.click(screen.getByRole('button', { name: 'Scene and character' }));

    const sheet = await screen.findByText('Scene & Character');
    const root = sheet.closest('[data-geek-sheet-mode]');
    expect(root).toHaveAttribute('data-geek-sheet-mode', 'sheet');
  }, 20000);

  it('opens the right rail as a GeekSheet in sheet mode', async () => {
    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');

    fireEvent.click(screen.getByRole('button', { name: 'Party and threads' }));

    const sheet = await screen.findByText('Party & Threads');
    const root = sheet.closest('[data-geek-sheet-mode]');
    expect(root).toHaveAttribute('data-geek-sheet-mode', 'sheet');
  }, 20000);
});

describe.skip('StoryPlay Bookify', () => {
  const originalClipboard = navigator.clipboard;
  const originalShare = navigator.share;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
  });

  it('opens with the story text and Copy writes it to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    api.post.mockResolvedValue({
      data: { success: true, data: { title: 'The Fog-Bound Crossroads', content: 'Once, at a foggy crossroads...' } },
    });

    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');

    fireEvent.click(screen.getByRole('button', { name: /bookify/i }));

    expect(await screen.findByText('Once, at a foggy crossroads...')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/export/stories/story-1/bookify');

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Once, at a foggy crossroads...'));
  }, 20000);

  it('shows a Share button when navigator.share exists', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
    api.post.mockResolvedValue({ data: { success: true, data: { title: 't', content: 'text' } } });

    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');
    fireEvent.click(screen.getByRole('button', { name: /bookify/i }));
    await screen.findByText('text');

    expect(screen.getByRole('button', { name: /^share$/i })).toBeInTheDocument();
  }, 20000);

  it('hides the Share button when navigator.share does not exist', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    api.post.mockResolvedValue({ data: { success: true, data: { title: 't', content: 'text' } } });

    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');
    fireEvent.click(screen.getByRole('button', { name: /bookify/i }));
    await screen.findByText('text');

    expect(screen.queryByRole('button', { name: /^share$/i })).not.toBeInTheDocument();
  }, 20000);
});

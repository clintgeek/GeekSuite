import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { lightTheme } from '../testUtils';
import api from '../../api';
import StoryPlay from '../../pages/StoryPlay';
import { GeekToastProvider } from '@geeksuite/ui';

// The named exports matter: StoryPlay imports `LONG_REQUEST_TIMEOUT_MS` and
// `messageFromBlobError` alongside the default, and a vitest ESM mock that
// omits a named export the module under test imports fails at import time.
vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT_MS: 180000,
  messageFromBlobError: vi.fn(async (err, fallback) => err?.message || fallback),
}));

// One frozen user object, returned by reference. A mock that builds a fresh
// `{ user: { id } }` per call hands every consumer a new identity on every
// render, which turns any `useEffect([... user])` into an infinite load loop —
// exactly what stalled this file for a day. The real AuthProvider memoises its
// context value; the mock must model that, not fight it.
vi.mock('@geeksuite/auth', () => {
  const authValue = { user: { id: 'user-1' } };
  return { useAuth: () => authValue };
});

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
        {/* The real toast provider: a failed turn now reports through
            `useToast()`, and without a provider the fallback is a no-op —
            a test could not tell a surfaced error from a swallowed one. */}
        <GeekToastProvider>
          <Routes>
            <Route path="/play/:storyId" element={<StoryPlay />} />
          </Routes>
        </GeekToastProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMobileMatchMedia();
  api.get.mockResolvedValue({ data: storyFixture });
});

describe('StoryPlay composer', () => {
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
    // The third argument is the per-call timeout: a turn chains two 45s GM
    // calls plus extraction, so it needs far more than the client default —
    // and the client default is no longer axios's "wait forever".
    expect(api.post).toHaveBeenCalledWith(
      '/stories/story-1/continue',
      expect.objectContaining({ userInput: 'I step into the mist.' }),
      { timeout: 180000 }
    );

    resolveContinue({ data: { aiResponse: 'The mist parts before you.' } });
    await waitFor(() => expect(input).toBeEnabled());
    expect(await screen.findByText('The mist parts before you.')).toBeInTheDocument();
  });
});

// The a11y pass (2026-09-05): the composer's send button is icon-only and the
// transcript is a scroll container with nothing focusable inside it. Both were
// axe findings on 04-play/08-composer; both are named contracts now, not
// incidental markup.
describe('StoryPlay accessibility', () => {
  it('names the icon-only send button', async () => {
    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');

    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('type', 'submit');
  });

  it('makes the transcript a named, keyboard-reachable log', async () => {
    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');

    const transcript = screen.getByRole('log', { name: 'Story transcript' });
    expect(transcript).toHaveAttribute('tabindex', '0');
  });
});

describe('StoryPlay rails', () => {
  it('opens the left rail as a GeekSheet in sheet mode', async () => {
    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');

    fireEvent.click(screen.getByRole('button', { name: 'Scene and character' }));

    const sheet = await screen.findByText('Scene & Character');
    const root = sheet.closest('[data-geek-sheet-mode]');
    expect(root).toHaveAttribute('data-geek-sheet-mode', 'sheet');
  });

  it('opens the right rail as a GeekSheet in sheet mode', async () => {
    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');

    fireEvent.click(screen.getByRole('button', { name: 'Party and threads' }));

    const sheet = await screen.findByText('Party & Threads');
    const root = sheet.closest('[data-geek-sheet-mode]');
    expect(root).toHaveAttribute('data-geek-sheet-mode', 'sheet');
  });
});

describe('StoryPlay Bookify', () => {
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
    // Bookify is one AI call per six events, so it carries the long timeout.
    expect(api.post).toHaveBeenCalledWith(
      '/export/stories/story-1/bookify',
      null,
      { timeout: 180000 }
    );

    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Once, at a foggy crossroads...'));
  });

  it('shows a Share button when navigator.share exists', async () => {
    Object.defineProperty(navigator, 'share', { value: vi.fn().mockResolvedValue(undefined), configurable: true });
    api.post.mockResolvedValue({ data: { success: true, data: { title: 't', content: 'text' } } });

    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');
    fireEvent.click(screen.getByRole('button', { name: /bookify/i }));
    await screen.findByText('text');

    expect(screen.getByRole('button', { name: /^share$/i })).toBeInTheDocument();
  });

  it('hides the Share button when navigator.share does not exist', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    api.post.mockResolvedValue({ data: { success: true, data: { title: 't', content: 'text' } } });

    renderStoryPlay();
    await screen.findByPlaceholderText('What do you do?');
    fireEvent.click(screen.getByRole('button', { name: /bookify/i }));
    await screen.findByText('text');

    expect(screen.queryByRole('button', { name: /^share$/i })).not.toBeInTheDocument();
  });
});

/**
 * Going-over 2026-09-05. A failed `/continue` used to leave a phantom player
 * bubble in the transcript and throw the typed text away.
 *
 * The backend pushes the player event into the in-memory document and only
 * `save()`s at the very end of the turn, after the AI call — so on a provider
 * error nothing is persisted and the bubble the player is looking at vanishes
 * on the next reload. The mirror case is worse: on a client timeout the
 * server can complete and save while the UI says "Failed to continue story",
 * after which the transcript is silently one turn behind the record and the
 * player retypes into a duplicate turn.
 */
describe('StoryPlay — a failed turn', () => {
  beforeEach(() => {
    api.post.mockRejectedValue(
      Object.assign(new Error('The narrator is unavailable right now.'), {
        response: { status: 500 },
      })
    );
  });

  it('takes back the phantom player bubble', async () => {
    renderStoryPlay();
    const input = await screen.findByPlaceholderText('What do you do?');

    fireEvent.change(input, { target: { value: 'I step into the mist' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    // Scoped to the transcript: the composer legitimately gets the text back
    // (the next test), so an unscoped query would find it in the textarea.
    await waitFor(() =>
      expect(
        within(screen.getByRole('log')).queryByText('I step into the mist')
      ).not.toBeInTheDocument()
    );
  });

  it('hands the player their words back instead of making them retype', async () => {
    renderStoryPlay();
    const input = await screen.findByPlaceholderText('What do you do?');

    fireEvent.change(input, { target: { value: 'I step into the mist' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => expect(input).toHaveValue('I step into the mist'));
  });

  it("shows the server's own message, not a generic failure", async () => {
    renderStoryPlay();
    const input = await screen.findByPlaceholderText('What do you do?');

    fireEvent.change(input, { target: { value: 'I step into the mist' } });
    fireEvent.submit(input.closest('form'));

    expect(
      await screen.findByText('The narrator is unavailable right now.')
    ).toBeInTheDocument();
  });

  it('re-reads the story so a turn the server actually completed is not lost', async () => {
    renderStoryPlay();
    const input = await screen.findByPlaceholderText('What do you do?');
    const loadsBefore = api.get.mock.calls.length;

    fireEvent.change(input, { target: { value: 'I step into the mist' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() =>
      expect(api.get.mock.calls.length).toBeGreaterThan(loadsBefore)
    );
  });

  it('re-enables the composer rather than leaving it stuck', async () => {
    renderStoryPlay();
    const input = await screen.findByPlaceholderText('What do you do?');

    fireEvent.change(input, { target: { value: 'I step into the mist' } });
    fireEvent.submit(input.closest('form'));

    await waitFor(() => expect(input).not.toBeDisabled());
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent, cleanup } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { lightTheme } from '../testUtils';
import api from '../../api';
import StoryPlay from '../../pages/StoryPlay';
import { GeekToastProvider } from '@geeksuite/ui';
import { composerDraftKey } from '../../game/turnClient';

/**
 * The turn lifecycle on the play screen (SUITE_REVIEW_2026-11 items 4, 5, 11
 * — 2026-11-16).
 *
 *   4  A turn that timed out on the client may still have been saved. The
 *      screen asks (GET /stories/:id/turns/:clientId) before it offers the
 *      words back, and a resend carries the same clientId so the server can
 *      answer it with the turn it already wrote.
 *   5  While another turn holds the story (409 TURN_IN_PROGRESS, or a load
 *      that finds one running) the screen says so, keeps the composer shut,
 *      and opens it again when that turn finishes.
 *   11 The composer's words survive leaving the page and are cleared when a
 *      turn is accepted.
 */

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT_MS: 180000,
  messageFromBlobError: vi.fn(async (err, fallback) => err?.message || fallback),
}));

// Wait polls in milliseconds, not seconds.
vi.mock('../../game/turnClient', async (importOriginal) => ({
  ...(await importOriginal()),
  turnWaitDelay: () => 5,
}));

vi.mock('@geeksuite/auth', () => {
  const authValue = { user: { id: 'user-1' } };
  return { useAuth: () => authValue };
});

const opening = { type: 'narrative', description: 'You arrive at a fog-shrouded crossroads.', timestamp: '2026-08-01T00:00:00.000Z' };
const playerLine = { type: 'dialogue', description: 'Player: I step into the mist.', timestamp: '2026-08-01T00:01:00.000Z' };
const reply = { type: 'narrative', description: 'The mist parts before you.', timestamp: '2026-08-01T00:01:30.000Z' };

const baseStory = (events = [opening], extra = {}) => ({
  _id: 'story-1', title: 'The Fog-Bound Crossroads', genre: 'Fantasy', events,
  characters: [{ name: 'Kestrel', isPlayer: true, status: 'alive', inventory: [], skills: [] }],
  worldState: { turnNumber: 1, currentSituation: 'The mist is thick.', timeOfDay: 'night' },
  storyThreads: [], storyState: { establishedFacts: [] }, locations: [],
  turnInProgress: null,
  ...extra,
});

/** Route api.get: the story itself, or a turn's status. Each can be a function of the call count. */
function serve({ story, turn }) {
  let storyCalls = 0;
  let turnCalls = 0;
  api.get.mockImplementation(async (url) => {
    if (String(url).includes('/turns/')) {
      turnCalls += 1;
      const t = typeof turn === 'function' ? turn(turnCalls, url) : turn;
      if (t instanceof Error) throw t;
      return { data: t || { status: 'unknown', turnInProgress: null } };
    }
    storyCalls += 1;
    return { data: typeof story === 'function' ? story(storyCalls) : story };
  });
}

const timeout = () => Object.assign(new Error('The server took too long to answer. Try again.'), { code: 'ECONNABORTED' });
const inProgress = (yours) => Object.assign(new Error('A turn is already being written for this tale. It will appear here when it is finished.'), {
  serverCode: 'TURN_IN_PROGRESS',
  response: { status: 409, data: { error: { code: 'TURN_IN_PROGRESS' }, turnInProgress: { yours } } },
});

function renderPlay() {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter initialEntries={['/play/story-1']}>
        <GeekToastProvider>
          <Routes>
            <Route path="/play/:storyId" element={<StoryPlay />} />
          </Routes>
        </GeekToastProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

const draft = () => {
  const raw = window.localStorage.getItem(`geek-draft:${composerDraftKey('story-1')}`);
  return raw ? JSON.parse(raw).value : null;
};

async function sendAction(text) {
  const input = await screen.findByPlaceholderText('What do you do?');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form'));
  return input;
}

const transcript = () => within(screen.getByRole('log'));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('item 4 — a turn that timed out is not played twice', () => {
  it('every turn carries a clientId', async () => {
    serve({ story: baseStory() });
    api.post.mockResolvedValue({ data: { aiResponse: 'The mist parts before you.' } });
    renderPlay();
    await sendAction('I step into the mist.');
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const body = api.post.mock.calls[0][1];
    expect(body.clientId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });

  it('a timeout on a turn the server saved: the page catches up and the words are NOT handed back', async () => {
    serve({
      story: (n) => (n === 1 ? baseStory() : baseStory([opening, playerLine, reply])),
      turn: { status: 'done', turnInProgress: null },
    });
    api.post.mockRejectedValue(timeout());
    renderPlay();
    const input = await sendAction('I step into the mist.');

    expect(await transcript().findByText('The mist parts before you.')).toBeInTheDocument();
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('');
    expect(draft()).toBeNull();
    // It asked about THIS turn.
    const clientId = api.post.mock.calls[0][1].clientId;
    expect(api.get).toHaveBeenCalledWith(`/stories/story-1/turns/${clientId}`);
    // One player line, not two.
    expect(transcript().getAllByText('I step into the mist.')).toHaveLength(1);
  });

  it('a timeout on a turn that did not land: the words come back, and sending again reuses the clientId', async () => {
    serve({ story: baseStory(), turn: { status: 'unknown', turnInProgress: null } });
    api.post.mockRejectedValueOnce(timeout());
    renderPlay();
    const input = await sendAction('I step into the mist.');
    await waitFor(() => expect(input).toHaveValue('I step into the mist.'));
    const first = api.post.mock.calls[0][1].clientId;

    api.post.mockResolvedValueOnce({ data: { aiResponse: 'The mist parts before you.' } });
    fireEvent.submit(input.closest('form'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1][1].clientId).toBe(first);
  });

  it('when the status check itself fails, the words still come back with the same clientId', async () => {
    serve({ story: baseStory(), turn: new Error('offline') });
    api.post.mockRejectedValueOnce(timeout());
    renderPlay();
    const input = await sendAction('I step into the mist.');
    await waitFor(() => expect(input).toHaveValue('I step into the mist.'));
    expect(draft()).toEqual({ text: 'I step into the mist.', clientId: api.post.mock.calls[0][1].clientId });
  });

  it('edited words are a new action with a new clientId', async () => {
    serve({ story: baseStory(), turn: { status: 'unknown', turnInProgress: null } });
    api.post.mockRejectedValueOnce(timeout());
    renderPlay();
    const input = await sendAction('I step into the mist.');
    await waitFor(() => expect(input).toHaveValue('I step into the mist.'));
    api.post.mockResolvedValueOnce({ data: { aiResponse: 'ok' } });
    fireEvent.change(input, { target: { value: 'I turn back.' } });
    fireEvent.submit(input.closest('form'));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1][1].clientId).not.toBe(api.post.mock.calls[0][1].clientId);
  });

  it('a replayed answer (the server already had the turn) rebuilds from the record instead of appending a copy', async () => {
    serve({ story: (n) => (n === 1 ? baseStory() : baseStory([opening, playerLine, reply])) });
    api.post.mockResolvedValue({ data: { aiResponse: 'The mist parts before you.', replayed: true } });
    renderPlay();
    await sendAction('I step into the mist.');
    expect(await transcript().findByText('The mist parts before you.')).toBeInTheDocument();
    await waitFor(() => expect(transcript().getAllByText('I step into the mist.')).toHaveLength(1));
    expect(transcript().getAllByText('The mist parts before you.')).toHaveLength(1);
  });
});

describe('item 5 — one turn at a time', () => {
  it("another device's turn: says so, keeps the words, shuts the composer, and reopens it when that turn lands", async () => {
    let lockLive = true;
    serve({
      story: (n) => (n === 1 ? baseStory() : baseStory([opening, playerLine, reply])),
      turn: () => (lockLive ? { status: 'unknown', turnInProgress: { clientId: 'other' } } : { status: 'unknown', turnInProgress: null }),
    });
    api.post.mockRejectedValue(inProgress(false));
    renderPlay();
    const input = await sendAction('I draw my sword.');

    expect(await screen.findByText('A turn is being written elsewhere')).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue('I draw my sword.'));
    expect(input).toBeDisabled();

    lockLive = false;
    expect(await transcript().findByText('The mist parts before you.')).toBeInTheDocument();
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('I draw my sword.');
    expect(screen.queryByText('A turn is being written elsewhere')).not.toBeInTheDocument();
  });

  it('its own original still running: waits for it and does not offer the words again', async () => {
    let done = false;
    serve({
      story: (n) => (n === 1 ? baseStory() : baseStory([opening, playerLine, reply])),
      turn: () => (done ? { status: 'done', turnInProgress: null } : { status: 'in_progress', turnInProgress: { clientId: 'mine' } }),
    });
    api.post.mockRejectedValue(inProgress(true));
    renderPlay();
    const input = await sendAction('I step into the mist.');

    expect(await screen.findByText('Your turn is still being written')).toBeInTheDocument();
    expect(input).toHaveValue('');
    done = true;
    expect(await transcript().findByText('The mist parts before you.')).toBeInTheDocument();
    await waitFor(() => expect(input).toBeEnabled());
    expect(input).toHaveValue('');
    expect(draft()).toBeNull();
  });

  it('opening a tale while a turn runs elsewhere shows it and keeps the composer shut', async () => {
    serve({
      story: baseStory([opening], { turnInProgress: { clientId: 'other', expiresAt: '2099-01-01T00:00:00Z' } }),
      turn: { status: 'unknown', turnInProgress: { clientId: 'other' } },
    });
    renderPlay();
    expect(await screen.findByText('A turn is being written elsewhere')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What do you do?')).toBeDisabled();
  });
});

// The wait clock counts from when the turn began, not from when an indicator
// mounted: the screen swaps its "writing" indicator for a "still being
// written" one mid-turn, and a reload finds a turn already running. Either
// way it used to say 0:00 and "usually one to three minutes" after minutes.
describe('the wait clock counts from the start of the turn', () => {
  const realNow = Date.now.bind(Date);
  let offset = 0;
  let nowSpy;
  beforeEach(() => {
    offset = 0;
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
  });
  afterEach(() => { nowSpy.mockRestore(); });

  it('opening a tale whose turn began 2½ minutes ago shows that, and says it is running long', async () => {
    const startedAt = new Date(realNow() - 150_000).toISOString();
    serve({
      story: baseStory([opening], { turnInProgress: { clientId: 'other', startedAt, expiresAt: '2099-01-01T00:00:00Z' } }),
      turn: { status: 'unknown', turnInProgress: { clientId: 'other', startedAt } },
    });
    renderPlay();
    expect(await screen.findByText('A turn is being written elsewhere')).toBeInTheDocument();
    expect(screen.getByTestId('writing-elapsed').textContent).toMatch(/^2:3\d$/);
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
  });

  it('a send that timed out and is still being written keeps counting from the send', async () => {
    let fail;
    serve({
      story: baseStory(),
      // No server start time: the screen's own send time is the clock's start.
      turn: { status: 'in_progress', turnInProgress: { clientId: 'mine' } },
    });
    api.post.mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
    renderPlay();
    await sendAction('I step into the mist.');
    expect(await screen.findByTestId('writing-elapsed')).toHaveTextContent('0:00');

    // Three minutes later the request gives up; the turn is still running.
    offset = 185_000;
    fail(timeout());
    expect(await screen.findByText('Your turn is still being written')).toBeInTheDocument();
    expect(screen.getByTestId('writing-elapsed').textContent).toMatch(/^3:0\d$/);
    expect(screen.getByText(/taking longer than usual/i)).toBeInTheDocument();
  });
});

describe('item 11 — the composer draft', () => {
  it('survives leaving the page and coming back', async () => {
    serve({ story: baseStory() });
    renderPlay();
    const input = await screen.findByPlaceholderText('What do you do?');
    fireEvent.change(input, { target: { value: 'I count the lanterns' } });
    expect(draft()).toEqual({ text: 'I count the lanterns', clientId: null });

    cleanup();
    renderPlay();
    expect(await screen.findByDisplayValue('I count the lanterns')).toBeInTheDocument();
  });

  it('is cleared when the turn is accepted', async () => {
    serve({ story: baseStory() });
    api.post.mockResolvedValue({ data: { aiResponse: 'The mist parts before you.' } });
    renderPlay();
    await sendAction('I step into the mist.');
    expect(await transcript().findByText('The mist parts before you.')).toBeInTheDocument();
    expect(draft()).toBeNull();
  });

  it('a page that died mid-turn: if that turn landed, the words are not offered again', async () => {
    window.localStorage.setItem(`geek-draft:${composerDraftKey('story-1')}`,
      JSON.stringify({ value: { text: 'I step into the mist.', clientId: 'client-dead-page' } }));
    serve({ story: baseStory([opening, playerLine, reply]), turn: { status: 'done', turnInProgress: null } });
    renderPlay();
    const input = await screen.findByPlaceholderText('What do you do?');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/stories/story-1/turns/client-dead-page'));
    await waitFor(() => expect(draft()).toBeNull());
    expect(input).toHaveValue('');
  });

  it('a page that died mid-turn: if it did not land, the words come back', async () => {
    window.localStorage.setItem(`geek-draft:${composerDraftKey('story-1')}`,
      JSON.stringify({ value: { text: 'I step into the mist.', clientId: 'client-dead-page' } }));
    serve({ story: baseStory(), turn: { status: 'unknown', turnInProgress: null } });
    renderPlay();
    expect(await screen.findByDisplayValue('I step into the mist.')).toBeInTheDocument();
  });
});

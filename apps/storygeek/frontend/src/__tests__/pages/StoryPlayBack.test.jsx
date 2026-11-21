import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { lightTheme } from '../testUtils';
import api from '../../api';
import StoryPlay from '../../pages/StoryPlay';
import { GeekToastProvider } from '@geeksuite/ui';
import { describeBack, isBackCommand } from '../../game/checkpoints';

/**
 * UX review 2026-11-18, StoryGeek #2: `/back` replaces every turn after the
 * checkpoint and cannot be undone, so the play screen asks first, and says
 * how many turns go.
 */

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
  LONG_REQUEST_TIMEOUT_MS: 180000,
  messageFromBlobError: vi.fn(async (err, fallback) => err?.message || fallback),
}));

vi.mock('@geeksuite/auth', () => {
  const authValue = { user: { id: 'user-1' } };
  return { useAuth: () => authValue };
});

const story = {
  _id: 'story-1', title: 'The Fog-Bound Crossroads', genre: 'Fantasy',
  events: [{ type: 'narrative', description: 'You arrive at a fog-shrouded crossroads.', timestamp: '2026-08-01T00:00:00.000Z' }],
  characters: [{ name: 'Kestrel', isPlayer: true, status: 'alive', inventory: [], skills: [] }],
  worldState: { turnNumber: 12, currentSituation: 'The mist is thick.', timeOfDay: 'night' },
  storyThreads: [], storyState: { establishedFacts: [] }, locations: [],
  checkpoints: [
    { id: '1', description: 'At the crossroads', turnNumber: 3, timestamp: '2026-08-01T00:00:00.000Z' },
    { id: '2', description: 'Before the gate', turnNumber: 8, timestamp: '2026-08-01T00:10:00.000Z' },
  ],
  turnInProgress: null,
};

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

async function send(text) {
  const input = await screen.findByPlaceholderText('What do you do?');
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest('form'));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  api.get.mockResolvedValue({ data: story });
  api.post.mockResolvedValue({ data: { type: 'checkpoint_restored', message: 'Restored to checkpoint "Before the gate".' } });
});

describe('checkpoints helper', () => {
  it('treats what the server treats as /back as /back', () => {
    expect(isBackCommand('/back')).toBe(true);
    expect(isBackCommand('  /BACK gate')).toBe(true);
    expect(isBackCommand('I go back')).toBe(false);
  });

  it('finds the latest checkpoint, or one by name, and counts the turns lost', () => {
    expect(describeBack(story, '/back')).toEqual({ checkpoint: story.checkpoints[1], lostTurns: 4, laterCheckpoints: 0 });
    expect(describeBack(story, '/back crossroads')).toEqual({ checkpoint: story.checkpoints[0], lostTurns: 9, laterCheckpoints: 1 });
    expect(describeBack(story, '/back nowhere')).toEqual({ checkpoint: null, lostTurns: null, laterCheckpoints: 0 });
  });
});

describe('/back asks before it rewinds', () => {
  it('does not send until the player confirms, and says what is lost', async () => {
    renderPlay();
    await send('/back');

    expect(await screen.findByText('Return to a checkpoint?')).toBeInTheDocument();
    expect(screen.getByText('Return to "Before the gate" (turn 8)?')).toBeInTheDocument();
    expect(screen.getByText(/The 4 turns played since then will be removed\. This cannot be undone\./)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Return' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1].userInput).toBe('/back');
  });

  it('Keep playing sends nothing and keeps the words in the composer', async () => {
    renderPlay();
    await send('/back');
    fireEvent.click(await screen.findByRole('button', { name: 'Keep playing' }));
    await waitFor(() => expect(screen.queryByText('Return to a checkpoint?')).not.toBeInTheDocument());
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('What do you do?')).toHaveValue('/back');
  });

  it('an ordinary turn is not asked about', async () => {
    api.post.mockResolvedValue({ data: { aiResponse: 'The mist parts.' } });
    renderPlay();
    await send('I step back into the mist.');
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Return to a checkpoint?')).not.toBeInTheDocument();
  });
});

// Review 2026-11-19: the dialog promised a rewind the server would not do,
// and "cannot be undone" when a later checkpoint could undo it.
describe('/back says only what the server will do', () => {
  it('no matching checkpoint: no dialog — the turn is sent and the server answers', async () => {
    api.post.mockResolvedValue({ data: { type: 'error', message: 'Checkpoint not found. Available checkpoints: At the crossroads (1), Before the gate (2)' } });
    renderPlay();
    await send('/back nowhere');
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(api.post.mock.calls[0][1].userInput).toBe('/back nowhere');
    expect(screen.queryByText('Return to a checkpoint?')).not.toBeInTheDocument();
    expect(await screen.findByText(/Checkpoint not found/)).toBeInTheDocument();
  });

  it('no checkpoints at all: no dialog either', async () => {
    api.get.mockResolvedValue({ data: { ...story, checkpoints: [] } });
    api.post.mockResolvedValue({ data: { type: 'error', message: 'No checkpoints available. Use /checkpoint to create one.' } });
    renderPlay();
    await send('/back');
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Return to a checkpoint?')).not.toBeInTheDocument();
  });

  it('an older checkpoint: the later one is kept, so it does not say "cannot be undone"', async () => {
    renderPlay();
    await send('/back crossroads');
    expect(await screen.findByText('Return to "At the crossroads" (turn 3)?')).toBeInTheDocument();
    const said = screen.getByText(/The 9 turns played since then will be removed\./);
    expect(said).toHaveTextContent('Your later checkpoint is kept, so you can return to it; turns after the newest one are gone for good.');
    expect(said).not.toHaveTextContent(/cannot be undone/i);
    expect(api.post).not.toHaveBeenCalled();
  });
});

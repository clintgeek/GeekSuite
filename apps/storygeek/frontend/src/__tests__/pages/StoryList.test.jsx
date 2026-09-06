import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { lightTheme } from '../testUtils';
import api from '../../api';
import StoryList from '../../pages/StoryList';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

vi.mock('@geeksuite/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const registerPrimaryAction = vi.fn();
// Partial mock: testUtils' theme (createStoryTheme) calls createGeekSuiteTheme
// from this same module at import time, so the real exports must survive —
// only useGeekPrimaryAction is overridden here.
vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useGeekPrimaryAction: (config) => registerPrimaryAction(config),
  };
});

const { GeekToastProvider } = await import('@geeksuite/ui');

const storyFixtures = [
  {
    _id: 'story-1',
    title: 'The Fog-Bound Crossroads',
    genre: 'Fantasy',
    status: 'active',
    stats: { totalInteractions: 4, totalDiceRolls: 1 },
    worldState: { currentSituation: 'A crow watches from the mist.' },
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    _id: 'story-2',
    title: 'Neon Dead Drop',
    genre: 'Cyberpunk',
    status: 'paused',
    stats: { totalInteractions: 0, totalDiceRolls: 0 },
    worldState: {},
    updatedAt: '2026-08-02T00:00:00.000Z',
  },
];

function renderStoryList() {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter>
        {/* The real provider, not the no-op fallback: `handleStartStory` and
            `handleDeleteStory` report failures through `useToast()`, so
            without it a test cannot tell a surfaced error from a swallowed
            one. Layout.jsx wraps the page the same way in the real app. */}
        <GeekToastProvider>
          <StoryList />
        </GeekToastProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: storyFixtures });
});

describe('StoryList', () => {
  it('registers the FAB with the "New Tale" label', async () => {
    renderStoryList();
    await waitFor(() => expect(registerPrimaryAction).toHaveBeenCalled());
    expect(registerPrimaryAction).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'New Tale' })
    );
  });

  it('renders a card per story from the fixture', async () => {
    renderStoryList();
    expect(await screen.findByText('The Fog-Bound Crossroads')).toBeInTheDocument();
    expect(screen.getByText('Neon Dead Drop')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/stories/user/user-1');
  });

  it('opens the New Tale dialog and submits it', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: { storyId: 'story-3' } });
    renderStoryList();
    await screen.findByText('The Fog-Bound Crossroads');

    await user.click(screen.getByRole('button', { name: /new tale/i }));

    const dialog = await screen.findByRole('dialog');
    const promptField = within(dialog).getByLabelText(/story prompt/i);
    // fireEvent.change, not user.type: MUI's autosizing multiline TextField
    // recomputes its row height on every keystroke, which makes a
    // character-by-character type() of a full sentence unnecessarily slow
    // under jsdom. A single change event exercises the same onChange path.
    fireEvent.change(promptField, { target: { value: 'A wanderer arrives at a crossroads.' } });

    const beginButton = within(dialog).getByRole('button', { name: /begin/i });
    expect(beginButton).toBeEnabled();
    await user.click(beginButton);

    // Going-over 2026-09-05: this used to assert `userId: 'user-1'` was in the
    // body — which is exactly what broke story creation. `startStorySchema` is
    // `.strict()` and has no `userId`, so every submit 400'd with
    // "Unrecognized key(s) in object: 'userId'" and the user saw only
    // "Failed to start story". The owner comes from the session
    // (`requireAuth` in storyController), never from the body. An
    // `objectContaining` assertion could not see the extra key, so the shape
    // is pinned exactly here.
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [path, body] = api.post.mock.calls[0];
    expect(path).toBe('/stories/start');
    expect(body).toEqual({
      prompt: 'A wanderer arrives at a crossroads.',
      title: 'Untitled Story',
      genre: 'Fantasy',
    });
    expect(Object.keys(body)).not.toContain('userId');
  });

  it('surfaces the server message rather than a generic failure', async () => {
    const user = userEvent.setup();
    const err = new Error("Validation failed — (root): Unrecognized key(s) in object: 'userId'");
    api.post.mockRejectedValue(err);
    renderStoryList();
    await screen.findByText('The Fog-Bound Crossroads');

    await user.click(screen.getByRole('button', { name: /new tale/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/story prompt/i), {
      target: { value: 'A wanderer arrives at a crossroads.' },
    });
    await user.click(within(dialog).getByRole('button', { name: /begin/i }));

    // api.js's response interceptor lifts the backend's envelope onto
    // `err.message`; the page must show it instead of swallowing it, or a
    // rejected create is a mystery to whoever hits it.
    expect(await screen.findByText(/Unrecognized key/)).toBeInTheDocument();
  });

  it('keeps Begin disabled until a prompt is entered', async () => {
    const user = userEvent.setup();
    renderStoryList();
    await screen.findByText('The Fog-Bound Crossroads');
    await user.click(screen.getByRole('button', { name: /new tale/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /begin/i })).toBeDisabled();
  });

  it('deletes a story through the delete confirm dialog', async () => {
    const user = userEvent.setup();
    api.delete.mockResolvedValue({});
    renderStoryList();
    // The delete control is icon-only, so its accessible name has to carry the
    // title — one "Delete" per card would be unusable with a screen reader
    // (a11y pass, 2026-09-05).
    await screen.findByText('Neon Dead Drop');
    const deleteButton = screen.getByRole('button', { name: 'Delete Neon Dead Drop' });

    await user.click(deleteButton);

    const confirmDialog = await screen.findByRole('dialog');
    expect(within(confirmDialog).getByText(/Neon Dead Drop/)).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: /destroy/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/stories/story-2'));
  });

  // TODO_ORDER #15: the load-error branch now renders `GeekErrorState` with a
  // real retry, replacing the empty-shelves card a failed load used to show
  // indistinguishably from a genuinely empty library.
  it('names every delete button after the tale it deletes', async () => {
    renderStoryList();
    await screen.findByText('The Fog-Bound Crossroads');

    expect(screen.getByRole('button', { name: 'Delete The Fog-Bound Crossroads' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Neon Dead Drop' })).toBeInTheDocument();
  });

  it('shows GeekEmptyState when the library is genuinely empty', async () => {
    api.get.mockResolvedValue({ data: [] });
    renderStoryList();
    expect(await screen.findByText('The shelves are empty')).toBeInTheDocument();
    expect(document.querySelector('[data-geek-empty-state]')).not.toBeNull();
  });

  it('shows GeekErrorState with a working retry when the load fails', async () => {
    const user = userEvent.setup();
    // Persistent (not `-Once`): the retry below fires a second load, and any
    // future refactor that adds another is covered too. (The comment here used
    // to claim StoryList's effect "re-fires on its own re-renders" — it does
    // not: it is keyed on `user?.id`, a string, per the repo's effects-depend-
    // on-`user?.id` rule. The mock above also returns one frozen object.)
    api.get.mockRejectedValue(new Error('network down'));
    renderStoryList();

    expect(await screen.findByText(/shelves won't open/i)).toBeInTheDocument();
    expect(document.querySelector('[data-geek-error-state]')).not.toBeNull();

    api.get.mockResolvedValue({ data: storyFixtures });
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText('The Fog-Bound Crossroads')).toBeInTheDocument();
  });
});

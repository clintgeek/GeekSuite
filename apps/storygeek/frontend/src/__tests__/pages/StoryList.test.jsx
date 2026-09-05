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
        <StoryList />
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

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        '/stories/start',
        expect.objectContaining({
          userId: 'user-1',
          prompt: 'A wanderer arrives at a crossroads.',
        })
      )
    );
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
    const card = (await screen.findByText('Neon Dead Drop')).closest('.MuiCard-root');
    // The delete control is an icon-only IconButton (no accessible name) —
    // select it by its `color="error"` MUI class rather than role name.
    const deleteButton = card.querySelector('button.MuiIconButton-colorError');
    expect(deleteButton).not.toBeNull();

    await user.click(deleteButton);

    const confirmDialog = await screen.findByRole('dialog');
    expect(within(confirmDialog).getByText(/Neon Dead Drop/)).toBeInTheDocument();

    await user.click(within(confirmDialog).getByRole('button', { name: /destroy/i }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/stories/story-2'));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { lightTheme } from '../testUtils';
import api from '../../api';
import RecentlyDeleted from '../../pages/RecentlyDeleted';
import { GeekToastProvider } from '@geeksuite/ui';

// Recently deleted (S-D5, 2026-11-16): Restore, Delete forever (confirmed),
// how long each tale has left, and a failed load that never looks empty.

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const DAY = 86400000;
const trashed = [
  { _id: 'story-9', title: 'The Salt Road', genre: 'Adventure', deletedAt: new Date(Date.now() - 2 * DAY).toISOString(), purgeAt: new Date(Date.now() + 28 * DAY - 1000).toISOString() },
];

function renderPage() {
  return render(
    <ThemeProvider theme={lightTheme}>
      <MemoryRouter>
        <GeekToastProvider>
          <RecentlyDeleted />
        </GeekToastProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: { stories: trashed, retentionDays: 30 } });
});

describe('Recently deleted', () => {
  it('lists each deleted tale with how long it has left', async () => {
    renderPage();
    expect(await screen.findByText('The Salt Road')).toBeInTheDocument();
    expect(screen.getByText(/Removed for good in 28 days/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/stories/deleted');
  });

  it('Restore brings a tale back and takes it off the list', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ data: {} });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Restore The Salt Road' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stories/story-9/restore'));
    await waitFor(() => expect(screen.queryByText('The Salt Road')).not.toBeInTheDocument());
  });

  it('Delete forever asks first, then removes it for good', async () => {
    const user = userEvent.setup();
    api.delete.mockResolvedValue({ data: {} });
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete The Salt Road forever' }));
    expect(api.delete).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/cannot be brought back/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^delete forever$/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/stories/story-9/forever'));
  });

  it('a failed load says so — it is never shown as an empty bin', async () => {
    api.get.mockRejectedValue(new Error('Network Error'));
    renderPage();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Nothing in the bin')).not.toBeInTheDocument();
  });

  it('an empty bin says what it is for', async () => {
    api.get.mockResolvedValue({ data: { stories: [] } });
    renderPage();
    expect(await screen.findByText('Nothing in the bin')).toBeInTheDocument();
  });
});

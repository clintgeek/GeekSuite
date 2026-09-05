import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserGeekPage from '../../pages/UserGeekPage';
import { renderWithProviders } from '../testUtils';
import api from '../../api';

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const USERS = [
  { id: 'u1', username: 'chef', email: 'chef@clintgeek.com' },
  { id: 'u2', username: 'sage', email: 'sage@clintgeek.com' },
];

describe('UserGeekPage', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    api.delete.mockReset();
  });

  it('shows a GeekErrorState with a retry action when the initial load fails', async () => {
    api.get.mockRejectedValue({ response: { data: { message: 'Server exploded' } } });
    renderWithProviders(<UserGeekPage />);
    await waitFor(() => expect(screen.getByText("Couldn't load users")).toBeInTheDocument());
    expect(screen.getByText('Server exploded')).toBeInTheDocument();
  });

  it('retrying the error state calls fetchUsers again', async () => {
    api.get.mockRejectedValueOnce({ response: { data: { message: 'boom' } } });
    renderWithProviders(<UserGeekPage />);
    await waitFor(() => expect(screen.getByText("Couldn't load users")).toBeInTheDocument());

    api.get.mockResolvedValueOnce({ data: { users: USERS } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(screen.getByText('chef')).toBeInTheDocument());
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('shows a GeekEmptyState when the user list is empty', async () => {
    api.get.mockResolvedValue({ data: { users: [] } });
    renderWithProviders(<UserGeekPage />);
    await waitFor(() => expect(screen.getByText('No users found')).toBeInTheDocument());
  });

  it('lists every user once loaded', async () => {
    api.get.mockResolvedValue({ data: { users: USERS } });
    renderWithProviders(<UserGeekPage />);
    await waitFor(() => expect(screen.getByText('chef')).toBeInTheDocument());
    expect(screen.getByText('chef@clintgeek.com')).toBeInTheDocument();
    expect(screen.getByText('sage')).toBeInTheDocument();
  });

  it('opens the create-user dialog and disables Create until every field is filled', async () => {
    api.get.mockResolvedValue({ data: { users: USERS } });
    renderWithProviders(<UserGeekPage />);
    await waitFor(() => expect(screen.getByText('chef')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    const createButton = screen.getByRole('button', { name: 'Create' });
    expect(createButton).toBeDisabled();

    await user.type(screen.getByLabelText('Username'), 'newperson');
    await user.type(screen.getByLabelText('Email'), 'newperson@clintgeek.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    expect(createButton).not.toBeDisabled();
  });

  it('creates a user then refreshes the list', async () => {
    api.get.mockResolvedValue({ data: { users: USERS } });
    api.post.mockResolvedValue({ data: { id: 'u3' } });
    renderWithProviders(<UserGeekPage />);
    await waitFor(() => expect(screen.getByText('chef')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    await user.type(screen.getByLabelText('Username'), 'newperson');
    await user.type(screen.getByLabelText('Email'), 'newperson@clintgeek.com');
    await user.type(screen.getByLabelText('Password'), 'hunter2');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/users', {
      username: 'newperson', email: 'newperson@clintgeek.com', password: 'hunter2',
    }));
    // The dialog closes and fetchUsers runs again (mount + post-create).
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('deletes a user and refreshes the list without an error state', async () => {
    api.get.mockResolvedValue({ data: { users: USERS } });
    api.delete.mockResolvedValue({});
    renderWithProviders(<UserGeekPage />);
    await waitFor(() => expect(screen.getByText('chef')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getAllByLabelText('delete')[0]);
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/users/u1'));
    expect(screen.queryByText("Couldn't load users")).not.toBeInTheDocument();
  });

  it('a failed delete does not blow away the visible list — it is a toast, not an error state', async () => {
    api.get.mockResolvedValue({ data: { users: USERS } });
    api.delete.mockRejectedValue({ response: { data: { message: 'nope' } } });
    renderWithProviders(<UserGeekPage />);
    await waitFor(() => expect(screen.getByText('chef')).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getAllByLabelText('delete')[0]);
    await waitFor(() => expect(api.delete).toHaveBeenCalled());
    // The list stays exactly as it was — no error state replaced it.
    expect(screen.getByText('chef')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load users")).not.toBeInTheDocument();
  });
});

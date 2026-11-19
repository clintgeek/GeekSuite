import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../../pages/LoginPage';
import RegisterPage from '../../pages/RegisterPage';
import { renderWithProviders } from '../testUtils';
import api from '../../api';

vi.mock('../../api', () => ({ default: { post: vi.fn() } }));
vi.mock('@geeksuite/backdrop', () => ({ loadBackdrop: () => Promise.resolve(null) }));
vi.mock('../../components/AuthContext', () => ({
  useBaseGeekAuth: () => ({ user: null, loading: false }),
}));

// The SSO door is every app's front door: a phone password manager only
// offers and saves the suite login when the fields say what they are.
describe('LoginPage autofill', () => {
  beforeEach(() => { api.post.mockReset(); });

  it('marks Sign in fields as username + current-password, uncapitalised', () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login?app=notegeek'] });
    const id = screen.getByLabelText(/username or email/i);
    expect(id).toHaveAttribute('name', 'username');
    expect(id).toHaveAttribute('type', 'text');
    expect(id).toHaveAttribute('autocomplete', 'username');
    expect(id).toHaveAttribute('autocapitalize', 'none');
    expect(id).toHaveAttribute('inputmode', 'email');
    expect(id).toHaveAttribute('spellcheck', 'false');
    const pw = screen.getByLabelText(/^password/i);
    expect(pw).toHaveAttribute('name', 'password');
    expect(pw).toHaveAttribute('type', 'password');
    expect(pw).toHaveAttribute('autocomplete', 'current-password');
  });

  it('switches the password to new-password on the Register tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });
    await user.click(screen.getByRole('tab', { name: 'Register' }));
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/^username/i)).toHaveAttribute('inputmode', 'text');
  });

  it('still posts the typed name as `identifier` to /auth/login', async () => {
    api.post.mockImplementation(() => Promise.reject(Object.assign(new Error('401'), { response: { data: { message: 'Nope' } } })));
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { initialEntries: ['/login?app=notegeek'] });
    await user.type(screen.getByLabelText(/username or email/i), 'chef');
    await user.type(screen.getByLabelText(/^password/i), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][0]).toBe('/auth/login');
    expect(api.post.mock.calls[0][1]).toMatchObject({ identifier: 'chef', app: 'notegeek' });
    expect(await screen.findByText('Nope')).toBeInTheDocument();
  });
});

describe('RegisterPage autofill', () => {
  it('marks fields as username, email and new-password', () => {
    renderWithProviders(<RegisterPage />, { initialEntries: ['/register'] });
    expect(screen.getByLabelText(/^username/i)).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText(/^email/i)).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute('autocomplete', 'new-password');
  });
});

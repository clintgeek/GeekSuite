/**
 * Sign in and /register, 2026-11-27: the first impression, in the app's own
 * look (one card, the ring mark, plain words) rather than the suite splash,
 * and with states for everything that can go wrong before a person is in:
 * the server unreachable, the sign-in page not opening, a second tap.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const auth = {
  login: vi.fn(), register: vi.fn(), retry: vi.fn(), loading: false, error: null, connectionProblem: false,
};
const loginRedirect = vi.fn();
vi.mock('@geeksuite/auth', () => ({
  useAuth: () => auth,
  loginRedirect: (...args) => loginRedirect(...args),
}));

const { default: Login } = await import('../Login.jsx');
const { default: Register } = await import('../Register.jsx');

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(auth, { loading: false, error: null, connectionProblem: false });
  auth.login.mockImplementation(() => {});
  auth.register.mockImplementation(() => {});
  loginRedirect.mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); });

describe('Login', () => {
  it('says what the app is, in plain words, with one primary button', () => {
    render(<Login />);
    expect(screen.getByRole('heading', { level: 1, name: 'FitnessGeek' })).toBeInTheDocument();
    expect(screen.getByText('What you eat, your weight and your health, in one place.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeEnabled();
    // Not the suite splash, and nothing a person has to decode.
    expect(document.body.textContent).not.toMatch(/Train smarter|workspace|GeekBase|baseGeek|SSO/i);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Sign in sends the person to sign in, once, however many taps', async () => {
    render(<Login />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); });
    const button = screen.getByRole('button', { name: 'Opening sign-in…' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Create an account' })).toBeDisabled();
  });

  it('Create an account sends the person to sign up', async () => {
    render(<Login />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create an account' })); });
    expect(auth.register).toHaveBeenCalledTimes(1);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('says so when the sign-in page could not be opened, and the button comes back', async () => {
    auth.login.mockImplementation(() => { throw new Error('blocked'); });
    render(<Login />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); });
    expect(screen.getByTestId('login-stuck')).toHaveTextContent('The sign-in page didn’t open. Check your connection and try again.');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('says so when nothing happened after a while', async () => {
    vi.useFakeTimers();
    render(<Login />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); });
    expect(screen.queryByTestId('login-stuck')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(8000); });
    expect(screen.getByTestId('login-stuck')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  it('says when the server cannot be reached, with a retry', () => {
    auth.connectionProblem = true;
    render(<Login />);
    expect(screen.getByTestId('login-connection')).toHaveTextContent('Can’t reach FitnessGeek right now. Check your connection.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(auth.retry).toHaveBeenCalledTimes(1);
  });

  it('shows a sign-in error in words', () => {
    auth.error = 'Your session ended. Sign in again.';
    render(<Login />);
    expect(screen.getByTestId('login-error')).toHaveTextContent('Your session ended. Sign in again.');
  });
});

describe('Register', () => {
  const mount = () => render(<MemoryRouter initialEntries={['/register']}><Register /></MemoryRouter>);

  it('hands over to sign-up and says so plainly', () => {
    mount();
    expect(loginRedirect).toHaveBeenCalledWith('fitnessgeek', expect.any(String), 'register');
    expect(screen.getByRole('status')).toHaveTextContent('Taking you to sign-up…');
    expect(document.body.textContent).not.toMatch(/baseGeek|Redirecting/);
  });

  it('cannot strand anyone: a hand-over that fails offers Try again and Back to sign in', () => {
    loginRedirect.mockImplementationOnce(() => { throw new Error('blocked'); });
    mount();
    expect(screen.getByRole('alert')).toHaveTextContent('The sign-up page didn’t open.');
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(loginRedirect).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('Taking you to sign-up…');
  });

  it('says so when the sign-up page has not opened after a while', async () => {
    vi.useFakeTimers();
    mount();
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

/**
 * Review B2 (app side): while the session check can't reach the server,
 * she stays signed in and sees a small "Can't reach FitnessGeek — retrying"
 * line — never the sign-in splash.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let auth = {};
vi.mock('@geeksuite/auth', () => ({ useAuth: () => auth }));
const { default: ProtectedRoute } = await import('../ProtectedRoute.jsx');

const mount = () => render(
  <MemoryRouter initialEntries={['/weight']}>
    <Routes>
      <Route path="/login" element={<p>Sign in page</p>} />
      <Route path="/weight" element={<ProtectedRoute><p>Weight page</p></ProtectedRoute>} />
    </Routes>
  </MemoryRouter>
);

describe('ProtectedRoute and a connection problem', () => {
  it('signed in, server unreachable: the page stays and a small line says so', () => {
    auth = { loading: false, isAuthenticated: true, connectionProblem: true, retry: vi.fn() };
    mount();
    expect(screen.getByText('Weight page')).toBeInTheDocument();
    expect(screen.getByTestId('connection-problem')).toHaveTextContent('Can’t reach FitnessGeek — retrying');
  });

  it('no known user and unreachable: waits, never redirects to sign in', () => {
    auth = { loading: false, isAuthenticated: false, connectionProblem: true, retry: vi.fn() };
    mount();
    expect(screen.queryByText('Sign in page')).toBeNull();
    expect(screen.getByText('Can’t reach FitnessGeek — retrying')).toBeInTheDocument();
  });

  it('really signed out still goes to sign in', () => {
    auth = { loading: false, isAuthenticated: false, connectionProblem: false };
    mount();
    expect(screen.getByText('Sign in page')).toBeInTheDocument();
  });

  it('no line when all is well', () => {
    auth = { loading: false, isAuthenticated: true, connectionProblem: false };
    mount();
    expect(screen.queryByTestId('connection-problem')).toBeNull();
  });
});

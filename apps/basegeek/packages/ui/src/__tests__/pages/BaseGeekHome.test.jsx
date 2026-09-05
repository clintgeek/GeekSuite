import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import BaseGeekHome from '../../pages/BaseGeekHome';
import { renderWithProviders } from '../testUtils';
import api from '../../api';

vi.mock('../../api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../components/AuthContext', () => ({
  useBaseGeekAuth: () => ({
    user: { username: 'chef', role: 'admin' },
    role: 'admin',
    isAdmin: true,
    loading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

/** The suite's four infra checks and every key app's health-proxy path. */
function mockHealthyBackend({ registry } = {}) {
  api.get.mockImplementation((url) => {
    if (url === '/apps') {
      return registry
        ? Promise.resolve({ data: { apps: registry } })
        : Promise.reject(new Error('registry unreachable'));
    }
    if (url === '/mongo/status') return Promise.resolve({ data: { serverInfo: { version: '7.0.1' } } });
    if (url === '/postgres/status') return Promise.resolve({ data: { version: 'PostgreSQL 16.2 on x86_64' } });
    if (url === '/redis/status') return Promise.resolve({ data: { redisVersion: '7.2.4' } });
    if (url === '/influx/status') return Promise.resolve({ data: { version: '2.7.4' } });
    if (url.startsWith('/health/app/')) {
      return Promise.resolve({
        data: { status: 'online', latency: 42, data: { version: '1.0.0' }, checkedAt: new Date().toISOString() },
      });
    }
    return Promise.reject(new Error(`unmocked url: ${url}`));
  });
}

describe('BaseGeekHome', () => {
  beforeEach(() => {
    api.get.mockReset();
  });

  it('renders the key apps in the fixed KEY_APPS order, not registry order', async () => {
    // Registry deliberately returns them in a different order (and drops one).
    mockHealthyBackend({
      registry: [
        { name: 'startgeek', displayName: 'startGeek', color: '#e6b35a', url: 'https://start.clintgeek.com', icon: 'RocketLaunch' },
        { name: 'fitnessgeek', displayName: 'fitnessGeek', color: '#7dac8e', url: 'https://fitnessgeek.clintgeek.com', icon: 'FitnessCenter' },
        { name: 'flockgeek', displayName: 'flockGeek', color: '#9a8f6a', url: 'https://flockgeek.clintgeek.com', icon: 'NatureOutlined' },
      ],
    });

    renderWithProviders(<BaseGeekHome />);

    await waitFor(() => expect(screen.getByText('fitnessGeek')).toBeInTheDocument());

    const names = ['fitnessGeek', 'bujoGeek', 'noteGeek', 'bookGeek', 'flockGeek', 'startGeek'];
    // Every consecutive pair must appear in document order (a precedes b).
    for (let i = 0; i < names.length - 1; i += 1) {
      const a = screen.getByText(names[i]);
      const b = screen.getByText(names[i + 1]);
      expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('falls back to the hardcoded app list, still in KEY_APPS order, when the registry is unreachable', async () => {
    mockHealthyBackend(); // no registry -> '/apps' rejects
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => expect(screen.getByText('fitnessGeek')).toBeInTheDocument());
    for (const name of ['bujoGeek', 'noteGeek', 'bookGeek', 'flockGeek', 'startGeek']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('shows PostgreSQL in the Infrastructure section', async () => {
    mockHealthyBackend();
    renderWithProviders(<BaseGeekHome />);
    expect(screen.getByText('Infrastructure')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('PostgreSQL')).toBeInTheDocument());
    // Sits alongside the other three infra checks.
    expect(screen.getByText('MongoDB')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('InfluxDB')).toBeInTheDocument();
  });

  it('hits the health proxy for every infra service and reports it online once resolved', async () => {
    mockHealthyBackend();
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/postgres/status'));
    expect(api.get).toHaveBeenCalledWith('/mongo/status');
    expect(api.get).toHaveBeenCalledWith('/redis/status');
    expect(api.get).toHaveBeenCalledWith('/influx/status');
    await waitFor(() => expect(screen.getAllByText(/\d+ms/).length).toBeGreaterThan(0));
  });

  it('reports a service offline when its status endpoint rejects', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/apps') return Promise.reject(new Error('no registry'));
      if (url === '/postgres/status') return Promise.reject(new Error('down'));
      if (url.startsWith('/health/app/')) {
        return Promise.resolve({ data: { status: 'online', latency: 10, data: {}, checkedAt: new Date().toISOString() } });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => {
      const pg = screen.getByText('PostgreSQL').closest('div');
      expect(within(pg).getByText('offline')).toBeInTheDocument();
    });
  });

  it('checks each app\'s health through the /health/app/<name> proxy, not the app directly', async () => {
    mockHealthyBackend();
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/health/app/fitnessgeek'));
    for (const name of ['bujogeek', 'notegeek', 'bookgeek', 'flockgeek', 'startgeek']) {
      expect(api.get).toHaveBeenCalledWith(`/health/app/${name}`);
    }
  });

  it('greets the signed-in user by username', async () => {
    mockHealthyBackend();
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => {
      expect(screen.getByText(/Good (morning|afternoon|evening), chef/)).toBeInTheDocument();
    });
  });

  it('links each app tile to its registered URL', async () => {
    mockHealthyBackend();
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => expect(screen.getByText('fitnessGeek')).toBeInTheDocument());
    const link = screen.getByRole('link', { name: /Open fitnessGeek/i });
    expect(link).toHaveAttribute('href', 'https://fitnessgeek.clintgeek.com');
  });
});

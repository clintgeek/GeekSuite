/**
 * `GET /api/influx/status` answers `{ userEnabled, serverConnected, error }`
 * (see `backend/src/routes/influxRoutes.js`). This component read
 * `response.connected` — a key the route has never sent — so "Test Connection"
 * reported "Connection Failed" against a perfectly healthy InfluxDB, and the
 * success branch it never reached printed `undefined` for the database name and
 * measurement count (two more fields the route does not send).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../services/apiService', () => ({
  apiService: {
    get: vi.fn(() => Promise.resolve({ data: { influxEnabled: true, healthBaselines: {} } })),
    patch: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../../services/influxService', () => ({
  influxService: { getStatus: vi.fn() },
}));

vi.mock('@geeksuite/ui', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ notify: vi.fn() }) };
});

const { influxService } = await import('../../services/influxService');
const { default: InfluxDBSettings } = await import('../InfluxDBSettings.jsx');

beforeEach(() => {
  influxService.getStatus.mockReset();
});

describe('Check the connection', () => {
  it('reads serverConnected, the key the route actually sends', async () => {
    influxService.getStatus.mockResolvedValue({
      userEnabled: true,
      serverConnected: true,
      error: null,
    });

    render(<InfluxDBSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Check the connection/i }));

    expect(await screen.findByText(/^Connected$/)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  // The route's own text ("connect ECONNREFUSED") is a driver message, not a
  // sentence for a person (review T-1): the failure is said in plain words.
  it('reports the failure in plain words, never the driver text', async () => {
    influxService.getStatus.mockResolvedValue({
      userEnabled: true,
      serverConnected: false,
      error: 'connect ECONNREFUSED',
    });

    render(<InfluxDBSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Check the connection/i }));

    expect(await screen.findByText(/Not connected/)).toBeInTheDocument();
    expect(screen.getByText('FitnessGeek couldn’t reach the home data server. Try again in a moment.')).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).toBeNull();
  });
});

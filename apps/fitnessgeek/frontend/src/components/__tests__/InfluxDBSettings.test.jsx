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

describe('Test Connection', () => {
  it('reads serverConnected, the key the route actually sends', async () => {
    influxService.getStatus.mockResolvedValue({
      userEnabled: true,
      serverConnected: true,
      error: null,
    });

    render(<InfluxDBSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Test Connection/i }));

    expect(await screen.findByText(/Connection Successful/i)).toBeInTheDocument();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('reports the failure the route describes', async () => {
    influxService.getStatus.mockResolvedValue({
      userEnabled: true,
      serverConnected: false,
      error: 'connect ECONNREFUSED',
    });

    render(<InfluxDBSettings />);
    fireEvent.click(await screen.findByRole('button', { name: /Test Connection/i }));

    expect(await screen.findByText(/Connection Failed/i)).toBeInTheDocument();
    expect(screen.getByText(/ECONNREFUSED/)).toBeInTheDocument();
  });
});

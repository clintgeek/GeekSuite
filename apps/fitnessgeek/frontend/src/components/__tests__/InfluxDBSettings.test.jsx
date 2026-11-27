/**
 * `GET /api/influx/status` answers `{ userEnabled, serverConnected, error }`
 * (see `backend/src/routes/influxRoutes.js`). This component read
 * `response.connected` — a key the route has never sent — so "Test Connection"
 * reported "Connection Failed" against a perfectly healthy InfluxDB, and the
 * success branch it never reached printed `undefined` for the database name and
 * measurement count (two more fields the route does not send).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

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
const { apiService } = await import('../../services/apiService');
const { default: InfluxDBSettings } = await import('../InfluxDBSettings.jsx');

beforeEach(() => {
  influxService.getStatus.mockReset();
  apiService.get.mockReset();
  apiService.patch.mockReset();
  apiService.get.mockResolvedValue({ data: { influxEnabled: true, healthBaselines: {} } });
  apiService.patch.mockResolvedValue({ data: {} });
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

describe('Watch settings', () => {
  it('"InfluxDB" appears once, on the switch, in a panel tagged Advanced', async () => {
    const { container } = render(<InfluxDBSettings />);
    const toggle = await screen.findByRole('checkbox', { name: 'Use the home data server (InfluxDB)' });
    expect(toggle).toBeChecked();
    expect(container.textContent.match(/InfluxDB/g)).toHaveLength(1);
    const panel = toggle.closest('[data-fg-panel]');
    expect(within(panel).getByText('Advanced')).toBeInTheDocument();
  });

  it('a failed read is not drawn as "off": no switch, a retry', async () => {
    apiService.get.mockRejectedValueOnce(new Error('Network Error'));
    render(<InfluxDBSettings />);
    expect(await screen.findByText('Couldn’t load watch settings')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('checkbox')).toBeChecked();
  });

  it('a number typed and not yet saved survives flipping the switch off and on', async () => {
    render(<InfluxDBSettings />);
    const hrv = await screen.findByLabelText(/Usual heart-rate variability/);
    fireEvent.change(hrv, { target: { value: '61' } });
    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    fireEvent.click(toggle);
    expect(await screen.findByLabelText(/Usual heart-rate variability/)).toHaveValue(61);
  });

  it('a failed save says so under the boxes and keeps what was typed', async () => {
    render(<InfluxDBSettings />);
    const hr = await screen.findByLabelText('Usual resting heart rate');
    fireEvent.change(hr, { target: { value: '55' } });
    apiService.patch.mockRejectedValueOnce(new Error('Request failed with status code 500'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByTestId('baseline-error')).toHaveTextContent('Couldn’t save your usual numbers. Try again.');
    expect(screen.getByLabelText('Usual resting heart rate')).toHaveValue(55);
    expect(screen.queryByText(/status code/)).toBeNull();
  });

  it('a failed switch says so beside it and stays where it was', async () => {
    render(<InfluxDBSettings />);
    const toggle = await screen.findByRole('checkbox');
    apiService.patch.mockRejectedValueOnce(new Error('Request failed with status code 500'));
    fireEvent.click(toggle);
    expect(await screen.findByTestId('toggle-error')).toHaveTextContent('Couldn’t save that setting. Try again.');
    expect(toggle).toBeChecked();
  });
});

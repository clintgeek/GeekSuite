/**
 * The Signal Box dashboard and its instruments, rendered: each dial, lamp and
 * lever is asserted against the data that drives it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within, act, renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BaseGeekHome from '../../pages/BaseGeekHome';
import Settings from '../../pages/Settings';
import Gauge from '../../signalbox/Gauge';
import { useIdle } from '../../signalbox/NightWatch';
import { getConsolePrefs, _resetConsolePrefs, DEFAULT_PREFS } from '../../signalbox/consolePrefs';
import { renderWithProviders } from '../testUtils';
import api from '../../api';
import { apolloClient } from '../../apolloClient';

vi.mock('../../api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../apolloClient', () => ({ apolloClient: { query: vi.fn() } }));

const auth = { user: { username: 'chef', role: 'admin' }, role: 'admin', isAdmin: true, loading: false, isAuthenticated: true, logout: vi.fn() };
vi.mock('../../components/AuthContext', () => ({ useBaseGeekAuth: () => auth }));

const STATUS = {
  catalog: {
    lastProbe: { alive: 14, dead: 6 },
    byProvider: { groq: { alive: 6, cooling: 0 }, cerebras: { alive: 0, cooling: 5 } },
    labels: { groq: 'Groq', cerebras: 'Cerebras' },
    running: false,
  },
  attention: [
    { kind: 'discovery_stale', severity: 'warn', text: 'Catalog last refreshed 3 days ago' },
    { kind: 'provider_listing_failed', severity: 'warn', provider: 'cerebras', text: 'Cerebras: listing failed' },
  ],
  spend: { todayUsd: 0.2, capPerDayUsd: 0.25, monthUsd: 1, capPerCallUsd: 0.02 },
};

const TRAFFIC = {
  today: '2026-09-07',
  days: [{ day: '2026-09-05', calls: 500, costUsd: 0, refusals: 0 }, { day: '2026-09-06', calls: 90, costUsd: 0, refusals: 0 }, { day: '2026-09-07', calls: 250, costUsd: 0, refusals: 0 }],
  apps: [],
};

function backend() {
  api.get.mockImplementation((url) => {
    if (url === '/apps') return Promise.reject(new Error('no registry'));
    if (url === '/ai/status') return Promise.resolve({ data: STATUS });
    if (url === '/health/infra') {
      return Promise.resolve({ data: { services: { mongo: { online: true, latency: 5 }, redis: { online: false, latency: null }, influx: { online: true, latency: 9 } } } });
    }
    if (url.startsWith('/health/app/')) return Promise.resolve({ data: { status: 'online', latency: 40, data: {} } });
    return Promise.resolve({ data: {} });
  });
  api.post.mockResolvedValue({ status: 202, data: { started: true } });
  apolloClient.query.mockResolvedValue({ data: { aiTraffic: TRAFFIC } });
}

describe('Gauge', () => {
  it('is a meter carrying the reading, its ceiling and a sentence', () => {
    renderWithProviders(
      <Gauge label="Paid spend today" value={0.2} max={0.25} fraction={0.8} zone="warn" zoneWord="nearing cap" readout="$0.200" caption="of $0.250" valueText="$0.200 of a $0.250 daily cap" />,
    );
    const meter = screen.getByRole('meter', { name: 'Paid spend today' });
    expect(meter).toHaveAttribute('aria-valuenow', '0.2');
    expect(meter).toHaveAttribute('aria-valuemax', '0.25');
    expect(meter).toHaveAttribute('aria-valuetext', '$0.200 of a $0.250 daily cap');
    // The zone is a word, not only an arc colour.
    expect(screen.getByText('nearing cap')).toBeInTheDocument();
  });

  it('says "no reading" rather than drawing a needle against nothing', () => {
    renderWithProviders(<Gauge label="Paid spend today" fraction={null} />);
    expect(screen.getByRole('img', { name: 'Paid spend today: no reading' })).toBeInTheDocument();
    expect(screen.queryByRole('meter')).not.toBeInTheDocument();
  });
});

describe('BaseGeekHome as the Signal Box', () => {
  beforeEach(() => {
    api.get.mockReset();
    api.post.mockReset();
    apolloClient.query.mockReset();
    auth.isAdmin = true;
    auth.role = 'admin';
    backend();
  });

  it('draws the spend dial from /ai/status, against the governor’s cap', async () => {
    renderWithProviders(<BaseGeekHome />);
    const meter = await screen.findByRole('meter', { name: 'Paid spend today' });
    expect(meter).toHaveAttribute('aria-valuenow', '0.2');
    expect(meter).toHaveAttribute('aria-valuemax', '0.25');
    expect(meter.getAttribute('aria-valuetext')).toMatch(/80%, nearing cap/);
  });

  it('draws the traffic dial from the ledger: today against the week’s busiest day', async () => {
    renderWithProviders(<BaseGeekHome />);
    const meter = await screen.findByRole('meter', { name: 'AI calls today' });
    expect(meter).toHaveAttribute('aria-valuenow', '250');
    expect(meter).toHaveAttribute('aria-valuemax', '500');
    expect(apolloClient.query).toHaveBeenCalledWith(expect.objectContaining({ variables: { days: 7 } }));
    expect(screen.getByRole('img', { name: /AI calls per day, last 3 days: Sat 500, Sun 90, Mon 250/ })).toBeInTheDocument();
  });

  it('lights exactly the annunciator windows the attention list names', async () => {
    renderWithProviders(<BaseGeekHome />);
    const grid = await screen.findByRole('list', { name: /Annunciator/ });
    await waitFor(() => expect(within(grid).getByText('Catalog stale').parentElement).toHaveTextContent('1 active'));
    expect(within(grid).getByText('Listing failed').parentElement).toHaveTextContent('1 active');
    expect(within(grid).getByText('Budget hit').parentElement).toHaveTextContent('clear');
  });

  it('puts a lamp and a word on every provider, a fault where the list says so', async () => {
    renderWithProviders(<BaseGeekHome />);
    expect(await screen.findByText('6 alive')).toBeInTheDocument();
    expect(screen.getByText('down')).toBeInTheDocument();
  });

  it('counts the attention warnings as cautions on the split-flap line status', async () => {
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => expect(screen.getByText('2 cautions')).toBeInTheDocument());
  });

  it('lever 2 starts catalog discovery, and says so', async () => {
    const user = userEvent.setup();
    renderWithProviders(<BaseGeekHome />);
    const lever = await screen.findByRole('button', { name: 'Lever 2: Discovery' });
    await user.click(lever);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/catalog/run'));
    expect(await screen.findByText(/Catalog discovery started/)).toBeInTheDocument();
  });

  it('lever 2 reports a discovery already running (409) without calling it a failure', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { started: false, reason: 'running' } } });
    const user = userEvent.setup();
    renderWithProviders(<BaseGeekHome />);
    await user.click(await screen.findByRole('button', { name: 'Lever 2: Discovery' }));
    expect(await screen.findByText('A catalog discovery is already running.')).toBeInTheDocument();
  });

  it('holds lever 2 over while the server says the job is running', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/ai/status') return Promise.resolve({ data: { ...STATUS, catalog: { ...STATUS.catalog, running: true } } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lever 2: Discovery' })).toBeDisabled());
  });

  it('gives a household member the line and the public depot, and nothing admin-only', async () => {
    auth.isAdmin = false;
    auth.role = 'user';
    renderWithProviders(<BaseGeekHome />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/health/infra'));
    await waitFor(() => expect(screen.getByText('Redis').closest('div')).toHaveTextContent('offline'));
    for (const url of ['/mongo/status', '/postgres/status', '/redis/status', '/influx/status', '/ai/status']) {
      expect(api.get).not.toHaveBeenCalledWith(url);
    }
    expect(apolloClient.query).not.toHaveBeenCalled();
    expect(screen.queryByText('Instruments')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Lever/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open noteGeek/ })).toBeInTheDocument();
  });
});

describe('the console switches', () => {
  beforeEach(() => {
    window.localStorage.clear();
    _resetConsolePrefs();
  });

  it('keeps sound off until someone turns it on', () => {
    expect(DEFAULT_PREFS.sound).toBe(false);
    expect(getConsolePrefs().sound).toBe(false);
  });

  it('Settings flips sound and Night Watch for real, and remembers them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />);
    await user.click(screen.getByRole('checkbox', { name: 'Box bell and lever sound' }));
    expect(getConsolePrefs().sound).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Night Watch' }));
    expect(getConsolePrefs().nightWatch).toBe(false);
    _resetConsolePrefs();
    expect(getConsolePrefs()).toMatchObject({ sound: true, nightWatch: false });
  });

  it('no longer offers the fake server form', () => {
    renderWithProviders(<Settings />);
    expect(screen.queryByLabelText(/JWT Secret/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save Settings/i })).not.toBeInTheDocument();
  });
});

describe('Night Watch', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete navigator.webdriver;
  });

  it('comes on after the idle time and goes off on input', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdle({ ms: 1000, enabled: true }));
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(1001); });
    expect(result.current).toBe(true);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' })); });
    expect(result.current).toBe(false);
  });

  it('never comes on under a browser automation driver', () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'webdriver', { value: true, configurable: true });
    const { result } = renderHook(() => useIdle({ ms: 1000, enabled: true }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(false);
  });

  it('never comes on when switched off', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useIdle({ ms: 1000, enabled: false }));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(false);
  });
});

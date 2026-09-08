/**
 * AIGeekPage.test.jsx — the status page, end to end against mocked transports.
 *
 * `GET /api/ai/status` and `POST /api/ai/catalog/run` are being built on the
 * API side in parallel, so everything here mocks them **at the documented
 * shape** (apps/basegeek/DOCS/AIGEEK_STATUS_PAGE.md §1). If the server ever
 * answers something else, these are the tests that should fail.
 *
 * Coverage is §5's list: the three panels render, the empty state carries its
 * two numbers, and each of the four attention actions does its one thing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, fireEvent, act } from '@testing-library/react';
import AIGeekPage from '../../pages/AIGeekPage';
import { renderWithProviders } from '../testUtils';
import { apolloClient } from '../../apolloClient';
import api from '../../api';

vi.mock('../../apolloClient', () => ({
  apolloClient: { query: vi.fn(), mutate: vi.fn() },
}));

vi.mock('../../api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

/** The operation name off a gql DocumentNode — mirrors how the gateway (and
 * bookgeek's `profileOperations.test.js`) inspect these documents. Lets the
 * mock route by *what is being asked*, not by which JS reference was passed
 * in — the same thing a real network layer would key on. */
const opName = (doc) => doc.definitions.find((d) => d.kind === 'OperationDefinition')?.name?.value;

const API_KEYS = [
  {
    id: 'k1', name: 'Prod key', appName: 'fitnessgeek', description: '', keyPrefix: 'bg_abcd',
    permissions: ['ai:call'], rateLimit: { requestsPerMinute: 60, requestsPerDay: 10000 },
    usage: { totalRequests: 12, lastUsed: null }, isActive: true, isExpired: false, expiresAt: null,
  },
];

const APP_CONFIGS = [
  {
    appName: 'fitnessgeek', displayName: 'fitnessgeek', tier: 'free', provider: null, model: null,
    enabled: true, notes: '', lastSeen: null, fallbackOrder: [], sticky: null, allowPaid: false,
    dailyCap: null,
  },
];

const AI_CONFIG = {
  groq: { hasKey: true, keyHint: '…ab12', enabled: true },
  cerebras: { hasKey: true, keyHint: '…cd34', enabled: true },
};

const ALIVE = [
  { provider: 'groq', modelId: 'llama-3.3-70b', fitness: 'structured', paid: false, lastSuccessAt: null },
];

/** A clean catalog: the empty-state case, with the two numbers §2 asks for. */
const CLEAN_STATUS = {
  generatedAt: new Date().toISOString(),
  catalog: {
    lastDiscovery: { at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), ok: true, alive: 7, dead: 1, unknown: 0 },
    lastProbe: { at: new Date().toISOString(), ok: true, alive: 7, dead: 1 },
    aliveFree: 7,
    structuredFree: 5,
    byProvider: { groq: { alive: 4, cooling: 0, structured: 3 }, cerebras: { alive: 3, cooling: 1, structured: 2 } },
  },
  attention: [],
  spend: { monthUsd: 1.76, todayUsd: 0.02, capPerDayUsd: 0.25, capPerCallUsd: 0.02, paidCallsMonth: 98, byApp: [] },
  apps: [{ app: 'fitnessgeek', tier: 'auto', sticky: null, allowPaid: false, dailyCap: null, seenInTraffic: true, hasRow: true, keys: 1, lastCallAt: null }],
};

const withAttention = (attention) => ({ ...CLEAN_STATUS, attention });

function mockTransports({ status = CLEAN_STATUS, recommendations = [] } = {}) {
  apolloClient.query.mockImplementation(({ query }) => {
    switch (opName(query)) {
      case 'GetAIConfig':
        return Promise.resolve({ data: { aiConfig: AI_CONFIG } });
      case 'GetAIStats':
        return Promise.resolve({ data: { aiStats: { totalCalls: 0, totalTokens: 0, totalCost: 0, providerUsage: {}, appUsage: {} } } });
      case 'GetAIDirectorModels':
        return Promise.resolve({ data: { aiDirectorModels: null } });
      case 'GetAIAppConfigs':
        return Promise.resolve({ data: { aiAppConfigs: { configs: APP_CONFIGS, discoveredApps: [] } } });
      case 'GetAPIKeys':
        return Promise.resolve({ data: { apiKeys: API_KEYS } });
      case 'RecommendAIModel':
        return Promise.resolve({ data: { aiRecommendModel: { recommendations } } });
      default:
        return Promise.reject(new Error(`unmocked query: ${opName(query)}`));
    }
  });
  apolloClient.mutate.mockResolvedValue({ data: {} });

  api.get.mockImplementation((url) => {
    if (url === '/ai/status') return Promise.resolve({ data: status });
    if (url === '/ai/models/alive') return Promise.resolve({ data: ALIVE });
    return Promise.reject(new Error(`unmocked GET ${url}`));
  });
  api.post.mockResolvedValue({ status: 202, data: { accepted: true } });
}

/** Which element ids the page asked the browser to scroll to. */
let scrolled = [];

describe('AIGeekPage', () => {
  beforeEach(() => {
    apolloClient.query.mockReset();
    apolloClient.mutate.mockReset();
    api.get.mockReset();
    api.post.mockReset();
    scrolled = [];
    // jsdom implements no scrolling at all, so the page's one scroll call has
    // to be stubbed to be observed.
    Element.prototype.scrollIntoView = vi.fn(function scrollIntoViewStub() {
      scrolled.push(this.id);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the three panels in order, on one page with no tabs', async () => {
    mockTransports();
    renderWithProviders(<AIGeekPage />);

    expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Usage and cost' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Apps and keys' })).toBeInTheDocument();
    // Five tabs became five sections; a tablist would mean they are still
    // alternatives, which is the thing Phase 3 undid.
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('collapses Catalog and Try it, and leaves their bodies unmounted until asked', async () => {
    mockTransports();
    renderWithProviders(<AIGeekPage />);
    await screen.findByRole('heading', { name: 'Needs attention' });

    expect(screen.getByRole('heading', { name: 'Catalog (read-only)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Try it' })).toBeInTheDocument();
    // Try it's prompt box only exists once the section is opened.
    expect(screen.queryByLabelText('Prompt')).toBeNull();

    const [, tryItToggle] = screen.getAllByRole('button', { name: 'Show' });
    fireEvent.click(tryItToggle);
    expect(await screen.findByLabelText('Prompt')).toBeInTheDocument();
  });

  it('shows the empty state with both numbers when nothing needs attention', async () => {
    mockTransports();
    renderWithProviders(<AIGeekPage />);

    expect(await screen.findByText('Nothing needs you')).toBeInTheDocument();
    expect(screen.getByText(/Last catalog refresh 2 hours ago; 7 free models alive\./)).toBeInTheDocument();
  });

  it('renders the spend line from status.spend, not from the session counters', async () => {
    mockTransports();
    renderWithProviders(<AIGeekPage />);
    expect(await screen.findByText(/This month: \$1\.76 of the \$10/)).toBeInTheDocument();
    expect(screen.getByText(/today \$0\.02/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.25\/day, \$0\.02\/call/)).toBeInTheDocument();
  });

  it('reads the provider roster from the server rather than a list of its own', async () => {
    mockTransports();
    renderWithProviders(<AIGeekPage />);
    await screen.findByRole('heading', { name: 'Providers' });
    expect(screen.getAllByLabelText('API key')).toHaveLength(2);
    expect(screen.getByText('4 alive · 3 structured')).toBeInTheDocument();
  });

  describe('the attention actions', () => {
    it('provider_dead → "Open provider" scrolls to that provider row', async () => {
      mockTransports({
        status: withAttention([
          { kind: 'provider_dead', severity: 'warn', provider: 'cerebras', text: 'Cerebras: key is set but no model answers (last listing: ok)' },
        ]),
      });
      renderWithProviders(<AIGeekPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Open provider' }));
      expect(scrolled).toContain('provider-cerebras');
    });

    it('provider_listing_failed → the same action, and the row chips the failure', async () => {
      mockTransports({
        status: withAttention([
          { kind: 'provider_listing_failed', severity: 'warn', provider: 'cerebras', text: 'Cerebras: listing failed (401) — check the key' },
        ]),
      });
      renderWithProviders(<AIGeekPage />);

      expect(await screen.findByText(/listing failed \(401\)/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Open provider' }));
      expect(scrolled).toContain('provider-cerebras');
      expect(screen.getByText('listing failed')).toBeInTheDocument();
    });

    it('unrouted_app → "Add routing" opens the dialog prefilled Automatic', async () => {
      mockTransports({
        status: withAttention([
          { kind: 'unrouted_app', severity: 'info', app: 'notegeek', text: 'notegeek is calling with no routing row (running as auto)' },
        ]),
      });
      renderWithProviders(<AIGeekPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Add routing' }));
      expect(await screen.findByText('Configure — notegeek')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Automatic' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('key_expiring → "Rotate" opens the existing mint flow for that app', async () => {
      mockTransports({
        status: withAttention([
          { kind: 'key_expiring', severity: 'info', app: 'fitnessgeek', text: "fitnessgeek key 'Prod key' expires 2026-09-14" },
        ]),
      });
      renderWithProviders(<AIGeekPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Rotate' }));
      // The mint flow is the existing API key dialog in create mode, titled
      // for the app the expiring key belongs to.
      expect(await screen.findByText('Mint key — fitnessgeek')).toBeInTheDocument();
    });

    it('discovery_stale → "Run discovery now" posts to /ai/catalog/run and then says Running…', async () => {
      mockTransports({
        status: withAttention([
          { kind: 'discovery_stale', severity: 'warn', text: 'Catalog last refreshed 3 days ago' },
        ]),
      });
      renderWithProviders(<AIGeekPage />);

      fireEvent.click(await screen.findByRole('button', { name: 'Run discovery now' }));
      await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/catalog/run'));
      // 202 and out of band: "running…" is the only honest label until a poll
      // disagrees, so the button says so and stops being clickable.
      const running = await screen.findByRole('button', { name: 'Running…' });
      expect(running).toBeDisabled();
    });

    it('offers no action for the kinds that are reports rather than chores', async () => {
      mockTransports({
        status: withAttention([
          { kind: 'repinned', severity: 'info', app: 'storygeek', text: 'storygeek: 2 conversation(s) moved off a dead model this week' },
          { kind: 'plaintext_keys', severity: 'info', text: '2 provider keys are stored unencrypted — run the encrypt-keys migration' },
        ]),
      });
      renderWithProviders(<AIGeekPage />);

      expect(await screen.findByText(/moved off a dead model/)).toBeInTheDocument();
      expect(screen.getByText(/stored unencrypted/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open provider' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Add routing' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Run discovery now' })).toBeNull();
    });
  });

  it('re-reads the status every 60 seconds while the page is visible', async () => {
    // Fake timers have to be installed *before* the mount, or the poll's
    // `setInterval` is registered against the real clock and advancing the
    // fake one moves nothing. `shouldAdvanceTime` keeps RTL's own waits alive.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockTransports();
    renderWithProviders(<AIGeekPage />);
    await screen.findByText('Nothing needs you');

    const statusCalls = () => api.get.mock.calls.filter(([url]) => url === '/ai/status').length;
    expect(statusCalls()).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(statusCalls()).toBe(2);

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(statusCalls()).toBe(3);
  });

  it('keeps the page usable when the status endpoint is missing entirely', async () => {
    // Which is exactly the state of production until the API half of Phase 3
    // lands: a 404 must cost panel 1 and nothing else.
    mockTransports();
    api.get.mockImplementation((url) => (url === '/ai/models/alive'
      ? Promise.resolve({ data: ALIVE })
      : Promise.reject(Object.assign(new Error('Request failed'), { response: { status: 404 } }))));

    renderWithProviders(<AIGeekPage />);

    expect(await screen.findByText("Couldn't read the AI status")).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Apps and keys' })).toBeInTheDocument();
    expect(screen.getByText('fitnessgeek')).toBeInTheDocument();
    expect(screen.getByText(/Spend for the month is unavailable/)).toBeInTheDocument();
  });

  it('honours the retired ?tab= slugs by scrolling to the section that absorbed them', async () => {
    mockTransports();
    renderWithProviders(<AIGeekPage />, { initialEntries: ['/aigeek?tab=keys'] });
    await screen.findByRole('heading', { name: 'Apps and keys' });
    await waitFor(() => expect(scrolled).toContain('apps-keys'));
  });
});

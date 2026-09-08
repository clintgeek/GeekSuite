/**
 * TestPromptPanel.test.jsx — Try it, after the move to the feature door.
 *
 * `POST /api/ai/call` was deleted this phase (D2), so every case that asserted
 * that path is re-pointed to `POST /api/ai/feature`, and three cases about the
 * Provider select went with the control: the door refuses half a pin
 * (`400 INCOMPLETE_PIN`), so a provider-without-model choice is not a thing
 * the panel can express. `AliveModelPicker` is the control now, and its own
 * coverage is in `AppsKeysPanel.test.jsx`.
 *
 * The case worth having here that did not exist before: **a soft failure is a
 * result.** `200 { ok: false, reason, provenance }` renders in place with its
 * hints, because the runner's contract is that a bad free-tier day is an
 * answer a caller falls back from — not an exception. Only 4xx/5xx is an
 * error.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestPromptPanel from '../../../pages/aigeek/TestPromptPanel';
import { renderWithProviders } from '../../testUtils';
import api from '../../../api';

vi.mock('../../../api', () => ({
  default: { post: vi.fn() },
}));

const PICKER = {
  groups: [
    {
      key: 'free',
      label: 'Free',
      rows: [
        { provider: 'cerebras', modelId: 'qwen-3-235b', fitness: 'structured', paid: false, lastSuccessAt: null },
      ],
    },
  ],
  loading: false,
  error: null,
  onReload: vi.fn(),
};

/** The provenance envelope every `/feature` answer carries. */
const provenance = (overrides = {}) => ({
  source: 'free',
  reason: 'ranked',
  model: 'qwen-3-235b',
  provider: 'cerebras',
  cached: false,
  callsToday: 3,
  cap: 200,
  costUsd: 0,
  hints: [],
  ...overrides,
});

const ok = (data, prov = {}) => ({ data: { ok: true, data, provenance: provenance(prov) } });

const panel = (props = {}) => <TestPromptPanel picker={PICKER} {...props} />;

describe('TestPromptPanel', () => {
  beforeEach(() => {
    api.post.mockReset();
  });

  it('the Run button is disabled with an empty prompt', () => {
    renderWithProviders(panel());
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });

  it('offers the alive picker instead of a provider select and a model id box', () => {
    renderWithProviders(panel());
    const picker = screen.getByLabelText('Model (Automatic when unset)');
    expect(picker.tagName).toBe('SELECT');
    expect(screen.queryByLabelText('Provider')).toBeNull();
    expect(screen.queryByLabelText(/model id/i)).toBeNull();
  });

  it('disables the Run button while the call is pending, and shows "Running…"', async () => {
    let resolveCall;
    api.post.mockReturnValue(new Promise((resolve) => { resolveCall = resolve; }));
    renderWithProviders(panel());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled());

    resolveCall(ok('Apple, banana, cherry'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled());
  });

  it('posts to /ai/feature as the tryit feature, with the prompt as the user turn and no pin', async () => {
    api.post.mockResolvedValue(ok('ok'));
    renderWithProviders(panel());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    // No `provider`/`model`: leaving the picker unset is what exercises the
    // health-ranked walk, and a half pin would be a 400.
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/feature', {
      feature: 'tryit',
      user: 'Name three fruits.',
    }));
  });

  it('sends provider and model together when a model is pinned', async () => {
    api.post.mockResolvedValue(ok('ok'));
    renderWithProviders(panel());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.change(screen.getByLabelText('Model (Automatic when unset)'), {
      target: { value: 'cerebras::qwen-3-235b' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/feature', {
      feature: 'tryit',
      user: 'Name three fruits.',
      provider: 'cerebras',
      model: 'qwen-3-235b',
    }));
  });

  it('renders the answer and the provenance the door reported', async () => {
    api.post.mockResolvedValue(ok('Apple, banana, cherry'));
    renderWithProviders(panel());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByText('Apple, banana, cherry')).toBeInTheDocument());
    // 'cerebras' also appears as an <option> in the picker, so scope to the
    // Fact's own <p> value.
    expect(screen.getByText('cerebras', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('qwen-3-235b', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('source free')).toBeInTheDocument();
    expect(screen.getByText('free')).toBeInTheDocument();
  });

  it('reports a free answer as "free" rather than $0.0000, and a paid one in dollars', async () => {
    api.post.mockResolvedValue(ok('hi', { costUsd: 0.0031 }));
    renderWithProviders(panel());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'hi');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByText('$0.0031')).toBeInTheDocument());
    expect(screen.getByText('3 / 200 today')).toBeInTheDocument();
  });

  it('renders a soft failure in place, with its reason and hints — not as an error', async () => {
    api.post.mockResolvedValue({
      data: {
        ok: false,
        reason: 'unavailable',
        provenance: provenance({ source: 'fallback', hints: ['pin_unavailable'], model: null, provider: null }),
      },
    });
    renderWithProviders(panel());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('unavailable')).toBeInTheDocument();
    expect(screen.getByText(/soft failure, not an error/)).toBeInTheDocument();
    expect(screen.getByText('pin_unavailable')).toBeInTheDocument();
    // And it is a warning, not the error alert a transport failure gets.
    expect(screen.queryByText(/The call failed/)).toBeNull();
  });

  it('shows an inline error when the door answers 4xx with a structured message', async () => {
    api.post.mockRejectedValue({
      response: { status: 400, data: { error: { message: 'provider and model must be sent together' } } },
    });
    renderWithProviders(panel());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByText('provider and model must be sent together')).toBeInTheDocument());
  });

  it('rejects an empty/invalid JSON schema before calling the door', async () => {
    renderWithProviders(panel());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByLabelText('JSON schema'));
    fireEvent.change(await screen.findByLabelText('Schema'), { target: { value: '{not valid json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText(/isn't valid JSON/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('wraps a bare schema in the { name, schema } envelope the door requires', async () => {
    api.post.mockResolvedValue(ok({ fruits: [] }));
    renderWithProviders(panel());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'List fruits as JSON.');
    fireEvent.click(screen.getByLabelText('JSON schema'));
    fireEvent.change(await screen.findByLabelText('Schema'), { target: { value: '{"type":"object"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/feature', {
      feature: 'tryit',
      user: 'List fruits as JSON.',
      schema: { name: 'output', schema: { type: 'object' } },
    }));
  });

  it('passes a full { name, schema } envelope through as it was written', async () => {
    api.post.mockResolvedValue(ok({ fruits: [] }));
    renderWithProviders(panel());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'List fruits as JSON.');
    fireEvent.click(screen.getByLabelText('JSON schema'));
    fireEvent.change(await screen.findByLabelText('Schema'), {
      target: { value: '{"name":"FruitList","schema":{"type":"object"}}' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/feature', {
      feature: 'tryit',
      user: 'List fruits as JSON.',
      schema: { name: 'FruitList', description: undefined, schema: { type: 'object' } },
    }));
  });

  it('renders a structured answer as pretty JSON, and keeps the raw envelope one click away', async () => {
    api.post.mockResolvedValue(ok({ fruits: ['apple'] }));
    renderWithProviders(panel());
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'List fruits as JSON.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByText(/"fruits"/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Show raw JSON' }));
    expect(await screen.findByText(/"provenance"/)).toBeInTheDocument();
  });
});

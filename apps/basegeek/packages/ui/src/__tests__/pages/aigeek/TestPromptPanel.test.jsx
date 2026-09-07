import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TestPromptPanel from '../../../pages/aigeek/TestPromptPanel';
import { renderWithProviders } from '../../testUtils';
import api from '../../../api';

vi.mock('../../../api', () => ({
  default: { post: vi.fn() },
}));

const CONFIG = {
  cerebras: { hasKey: true, enabled: true, keyHint: '...ab12' },
  groq: { hasKey: true, enabled: false, keyHint: '...cd34' }, // enabled=false: not reachable
  gemini: { hasKey: false, enabled: true, keyHint: '' }, // no key: not reachable
};

describe('TestPromptPanel', () => {
  beforeEach(() => {
    api.post.mockReset();
  });

  it('lists only providers that are both enabled and hold a key', () => {
    renderWithProviders(<TestPromptPanel config={CONFIG} />);
    expect(screen.getByText('Enabled providers holding a key')).toBeInTheDocument();
    const select = screen.getByLabelText('Provider');
    const options = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(options).toEqual(['', 'cerebras']);
  });

  it('shows the "no provider reachable" hint when nothing qualifies', () => {
    renderWithProviders(<TestPromptPanel config={{ cerebras: { hasKey: false, enabled: false } }} />);
    expect(screen.getByText('No provider is enabled with a key yet')).toBeInTheDocument();
  });

  it('the Run button is disabled with an empty prompt', () => {
    renderWithProviders(<TestPromptPanel config={CONFIG} />);
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });

  it('disables the Run button while the call is pending, and shows "Running…"', async () => {
    let resolveCall;
    api.post.mockReturnValue(new Promise((resolve) => { resolveCall = resolve; }));
    renderWithProviders(<TestPromptPanel config={CONFIG} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Running…' })).toBeDisabled());

    resolveCall({ data: { choices: [{ message: { content: 'Apple, banana, cherry' } }], provider: 'cerebras', model: 'qwen-3-235b', usage: { total_tokens: 12 } } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run' })).not.toBeDisabled());
  });

  it('posts to /ai/call with no appName field, so it exercises the default rotation', async () => {
    api.post.mockResolvedValue({ data: { choices: [{ message: { content: 'ok' } }] } });
    renderWithProviders(<TestPromptPanel config={CONFIG} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/call', { prompt: 'Name three fruits.', config: {} }));
  });

  it('renders the response content, provider, model and latency once the call resolves', async () => {
    api.post.mockResolvedValue({
      data: {
        choices: [{ message: { content: 'Apple, banana, cherry' } }],
        provider: 'cerebras',
        model: 'qwen-3-235b-a22b-instruct-2507',
        usage: { total_tokens: 12, prompt_tokens: 4, completion_tokens: 8 },
      },
    });
    renderWithProviders(<TestPromptPanel config={CONFIG} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByText('Apple, banana, cherry')).toBeInTheDocument());
    // 'cerebras' also appears as an <option> in the Provider select, so scope
    // to the Fact's <p> value.
    expect(screen.getByText('cerebras', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('qwen-3-235b-a22b-instruct-2507')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('shows an inline error when the call fails with a structured message', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'Upstream provider timed out' } } } });
    renderWithProviders(<TestPromptPanel config={CONFIG} />);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(screen.getByText('Upstream provider timed out')).toBeInTheDocument());
  });

  it('rejects an empty/invalid JSON schema before calling the API', async () => {
    renderWithProviders(<TestPromptPanel config={CONFIG} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'Name three fruits.');
    fireEvent.click(screen.getByLabelText('JSON schema'));
    fireEvent.change(await screen.findByLabelText('Schema'), { target: { value: '{not valid json' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText(/isn't valid JSON/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('sends a valid JSON schema as responseFormat', async () => {
    api.post.mockResolvedValue({ data: { choices: [{ message: { content: '{}' } }] } });
    renderWithProviders(<TestPromptPanel config={CONFIG} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Prompt'), 'List fruits as JSON.');
    fireEvent.click(screen.getByLabelText('JSON schema'));
    fireEvent.change(await screen.findByLabelText('Schema'), { target: { value: '{"type":"object"}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/call', {
      prompt: 'List fruits as JSON.',
      config: { responseFormat: { type: 'json_schema', json_schema: { name: 'output', schema: { type: 'object' } } } },
    }));
  });
});

/**
 * ProvidersBlock.test.jsx — what the Configuration tab became.
 *
 * The tab had four controls per provider (Enable, key, Test, and a shared
 * Save-all) to express one fact. This has one: the key, saved on blur. So the
 * cases below are as much about what is *absent* — no Enabled switch, no Test
 * button, no Save — as about what works, because those three are exactly what
 * §3 deleted and what a well-meant future patch would re-add.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProvidersBlock from '../../../pages/aigeek/ProvidersBlock';
import { renderWithProviders } from '../../testUtils';

/** The roster, as `aiConfig` reports it — the UI keeps no list of its own. */
const CONFIG = {
  groq: { hasKey: true, keyHint: '…ab12', enabled: true, apiKey: '', touched: false },
  cerebras: { hasKey: true, keyHint: '…cd34', enabled: true, apiKey: '', touched: false },
  cloudflare: { hasKey: false, keyHint: '', enabled: false, apiKey: '', accountId: '', touched: false },
};

const STATUS = {
  catalog: {
    byProvider: {
      groq: { alive: 3, cooling: 1, structured: 2 },
      cerebras: { alive: 0, cooling: 4, structured: 0 },
    },
  },
  attention: [
    { kind: 'provider_listing_failed', severity: 'warn', provider: 'cerebras', text: 'Cerebras: listing failed (401)' },
  ],
};

function baseProps(overrides = {}) {
  return {
    config: CONFIG,
    configError: null,
    savingProvider: null,
    status: null,
    onRetry: vi.fn(),
    onFieldChange: vi.fn(),
    onBlurSave: vi.fn(),
    ...overrides,
  };
}

describe('ProvidersBlock', () => {
  it('renders one row per provider the server reported, and no others', () => {
    // The roster used to be `CONFIG_PROVIDERS`, hand-typed in useAIGeek.js,
    // which is how a retired provider stayed on this page for months.
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    expect(screen.getByText('groq')).toBeInTheDocument();
    expect(screen.getByText('cerebras')).toBeInTheDocument();
    expect(screen.getByText('cloudflare')).toBeInTheDocument();
    expect(screen.queryByText('together')).toBeNull();
    expect(screen.getAllByLabelText('API key')).toHaveLength(3);
  });

  it('the key field is a password input, so a pasted credential is never on screen', () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    for (const field of screen.getAllByLabelText('API key')) {
      expect(field).toHaveAttribute('type', 'password');
    }
  });

  it('shows the stored key hint as the placeholder, never the key', () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    expect(screen.getAllByLabelText('API key')[0]).toHaveAttribute('placeholder', '…ab12');
  });

  it('typing reports the field change; blurring is what saves', async () => {
    const onFieldChange = vi.fn();
    const onBlurSave = vi.fn();
    renderWithProviders(<ProvidersBlock {...baseProps({ onFieldChange, onBlurSave })} />);

    const field = screen.getAllByLabelText('API key')[0];
    fireEvent.change(field, { target: { value: 'gsk_new' } });
    expect(onFieldChange).toHaveBeenCalledWith('groq', 'apiKey', 'gsk_new');
    expect(onBlurSave).not.toHaveBeenCalled();

    fireEvent.blur(field);
    expect(onBlurSave).toHaveBeenCalledWith('groq');
  });

  it('gives Cloudflare an Account ID field, and nobody else one', () => {
    const onBlurSave = vi.fn();
    renderWithProviders(<ProvidersBlock {...baseProps({ onBlurSave })} />);
    expect(screen.getAllByLabelText('Account ID')).toHaveLength(1);
    // Same blur contract as the key: the row saves as a unit, so the account
    // id and the token cannot be half-written.
    fireEvent.blur(screen.getByLabelText('Account ID'));
    expect(onBlurSave).toHaveBeenCalledWith('cloudflare');
  });

  it('has no Enabled switch, no Test button and no Save — a key is the whole configuration', () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    expect(screen.queryByLabelText('Enabled')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /test/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
  });

  it('chips a keyless provider "no key"', () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    expect(screen.getByText('no key')).toBeInTheDocument();
  });

  it('chips the live counts from status.catalog.byProvider — the chip is the test', () => {
    renderWithProviders(<ProvidersBlock {...baseProps({ status: STATUS })} />);
    expect(screen.getByText('3 alive · 2 structured')).toBeInTheDocument();
  });

  it('chips "listing failed" when the attention list says that key was refused', () => {
    // The status shape carries no per-provider error field; the failure is an
    // attention item, and reading it back from there keeps one source of truth.
    renderWithProviders(<ProvidersBlock {...baseProps({ status: STATUS })} />);
    expect(screen.getByText('listing failed')).toBeInTheDocument();
    // ...and it wins over the row's zero-alive count, which is a symptom of it.
    expect(screen.queryByText('0 alive · 0 structured')).toBeNull();
  });

  it('says "status unknown" rather than "0 alive" when the status endpoint did not answer', () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    expect(screen.getAllByText('status unknown')).toHaveLength(2);
  });

  it('replaces itself with a GeekErrorState when the config read failed', async () => {
    const onRetry = vi.fn();
    renderWithProviders(<ProvidersBlock {...baseProps({ configError: new Error('nope'), onRetry })} />);
    expect(screen.getByText("Couldn't load provider configuration")).toBeInTheDocument();
    expect(screen.queryByLabelText('API key')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

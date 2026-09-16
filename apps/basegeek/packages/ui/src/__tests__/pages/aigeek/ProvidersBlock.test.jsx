/**
 * ProvidersBlock.test.jsx — what the Configuration tab became.
 *
 * The tab had four controls per provider (Enable, key, Test, and a shared
 * Save-all) to express one fact. This has one: the key, saved on blur. So the
 * cases below are as much about what is *absent* — no Enabled switch, no Test
 * button, no Save — as about what works, because those three are exactly what
 * §3 deleted and what a well-meant future patch would re-add.
 *
 * Rows collapse now, so most cases open one first. `openRow` is that click.
 * The collapsed default is itself a contract — nine permanent password boxes
 * were most of this block's height — so the first two cases assert it.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
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
    onRemoveKey: vi.fn(),
    ...overrides,
  };
}

/**
 * Reveal one provider's key editor. Keyed rows say Replace, keyless say Add —
 * and several rows say the same thing, so this takes the nth match rather than
 * `getByRole`, which throws on the ambiguity.
 */
async function openRow(name, index = 0) {
  const user = userEvent.setup();
  await user.click(screen.getAllByRole('button', { name })[index]);
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
  });

  it('shows no key field until you say which provider you are changing', () => {
    // Nine providers each holding an open password box and two lines of helper
    // text was most of this block's height, spent on the action taken least
    // often. The roster is what the page is for; the field is a detour.
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(screen.queryByLabelText('Account ID')).toBeNull();
    // ...but every row offers the way in, worded for what it will do.
    expect(screen.getAllByRole('button', { name: /replace key/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /add key/i })).toHaveLength(1);
  });

  it('the key field is a password input, so a pasted credential is never on screen', async () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    await openRow(/add key/i);
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });

  it('shows the stored key hint as the placeholder, never the key', async () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    await openRow(/replace key/i, 0); // groq, the first keyed row
    expect(screen.getByLabelText('API key')).toHaveAttribute('placeholder', '…ab12');
  });

  it('shows the stored key hint on the collapsed line, so two keys can be told apart', () => {
    // The one fact the always-open field carried that the roster did not.
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    expect(screen.getByText('…ab12')).toBeInTheDocument();
    expect(screen.getByText('…cd34')).toBeInTheDocument();
  });

  it('typing reports the field change; blurring is what saves', async () => {
    const onFieldChange = vi.fn();
    const onBlurSave = vi.fn();
    renderWithProviders(<ProvidersBlock {...baseProps({ onFieldChange, onBlurSave })} />);
    await openRow(/replace key/i, 0); // groq

    const field = screen.getByLabelText('API key');
    fireEvent.change(field, { target: { value: 'gsk_new' } });
    expect(onFieldChange).toHaveBeenCalledWith('groq', 'apiKey', 'gsk_new');
    expect(onBlurSave).not.toHaveBeenCalled();

    fireEvent.blur(field);
    expect(onBlurSave).toHaveBeenCalledWith('groq');
  });

  it('gives Cloudflare an Account ID field, and nobody else one', async () => {
    const onBlurSave = vi.fn();
    renderWithProviders(<ProvidersBlock {...baseProps({ onBlurSave })} />);
    await openRow(/add key/i); // cloudflare is the only keyless row
    expect(screen.getAllByLabelText('Account ID')).toHaveLength(1);
    // Same blur contract as the key: the row saves as a unit, so the account
    // id and the token cannot be half-written.
    fireEvent.blur(screen.getByLabelText('Account ID'));
    expect(onBlurSave).toHaveBeenCalledWith('cloudflare');
  });

  it('opens the row whose key was refused, because that is the one you came to fix', () => {
    renderWithProviders(<ProvidersBlock {...baseProps({ status: STATUS })} />);
    // cerebras is the 401 in STATUS.attention, and only its editor is open.
    expect(screen.getByLabelText('API key')).toHaveAttribute('placeholder', '…cd34');
  });

  it('lets you close a row that opened itself, and leaves it closed', async () => {
    // The refusal stays in `status` until the next discovery run, so a naive
    // "open when failed" would spring back open every time it was dismissed.
    renderWithProviders(<ProvidersBlock {...baseProps({ status: STATUS })} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    // Collapse unmounts on exit, but only once the transition has run.
    await waitFor(() => expect(screen.queryByLabelText('API key')).toBeNull());
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


describe('stopping a provider is one explicit button, not an empty box', () => {
  // The server keeps a stored key when a blank one is saved (it can never echo
  // a key back), so "clear the box to disable" was a promise the page could
  // not keep. Remove key deletes the credential, behind a confirm.
  it('offers Remove key only for providers that have a stored key', () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    const buttons = screen.getAllByRole('button', { name: /remove key/i });
    expect(buttons).toHaveLength(2); // groq + cerebras; cloudflare has no key
  });

  it('asks first, names the provider, and only then calls onRemoveKey', async () => {
    const onRemoveKey = vi.fn().mockResolvedValue();
    renderWithProviders(<ProvidersBlock {...baseProps({ onRemoveKey })} />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: /remove key/i })[0]);
    expect(screen.getByText(/stop using groq\?/i)).toBeInTheDocument();
    expect(onRemoveKey).not.toHaveBeenCalled();
    // The dialog's confirm is the last "Remove key" button in the document.
    await user.click(screen.getAllByRole('button', { name: /^remove key$/i }).at(-1));
    expect(onRemoveKey).toHaveBeenCalledWith('groq');
  });

  it('never claims an empty box disables anything', () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    expect(screen.queryByText(/clear the box to stop using/i)).not.toBeInTheDocument();
    // The guidance used to be helper text under an always-open field. With the
    // field collapsed, the button itself carries it: every keyed row shows the
    // one control that actually stops a provider.
    expect(screen.getAllByRole('button', { name: /remove key/i })).toHaveLength(2);
  });
});

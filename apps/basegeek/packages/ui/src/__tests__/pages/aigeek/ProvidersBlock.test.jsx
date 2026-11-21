/**
 * ProvidersBlock.test.jsx — what the Configuration tab became.
 *
 * The tab had four controls per provider (Enable, key, Test, and a shared
 * Save-all) to express one fact. This has one: the key, saved by the row's own
 * Save key button (blur-saving was retired 2026-11-18: "click away" means
 * nothing on a phone, and it made a Cancel impossible). So the
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
    onSaveKey: vi.fn().mockResolvedValue(true),
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

  it('typing reports the field change; Save key saves, and losing focus does not', async () => {
    const onFieldChange = vi.fn();
    const onSaveKey = vi.fn().mockResolvedValue(true);
    renderWithProviders(<ProvidersBlock {...baseProps({ onFieldChange, onSaveKey })} />);
    await openRow(/replace key/i, 0); // groq

    const field = screen.getByLabelText('API key');
    // Nothing pasted, nothing to save.
    expect(screen.getByRole('button', { name: 'Save key' })).toBeDisabled();
    fireEvent.change(field, { target: { value: 'gsk_new' } });
    expect(onFieldChange).toHaveBeenCalledWith('groq', 'apiKey', 'gsk_new');

    fireEvent.blur(field);
    expect(onSaveKey).not.toHaveBeenCalled();
  });

  it('Save key commits the pasted key, closes the row and says Saved with the hint', async () => {
    const onSaveKey = vi.fn().mockResolvedValue(true);
    const config = { ...CONFIG, groq: { ...CONFIG.groq, apiKey: 'gsk_new', touched: true } };
    renderWithProviders(<ProvidersBlock {...baseProps({ config, onSaveKey })} />);
    await openRow(/replace key/i, 0); // groq
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    expect(onSaveKey).toHaveBeenCalledWith('groq');
    await waitFor(() => expect(screen.queryByLabelText('API key')).toBeNull());
    expect(screen.getByText('Saved · …ab12')).toBeInTheDocument();
  });

  it('the phone keyboard\'s Go (form submit) saves too', async () => {
    const onSaveKey = vi.fn().mockResolvedValue(true);
    const config = { ...CONFIG, groq: { ...CONFIG.groq, apiKey: 'gsk_new', touched: true } };
    renderWithProviders(<ProvidersBlock {...baseProps({ config, onSaveKey })} />);
    await openRow(/replace key/i, 0);
    fireEvent.submit(screen.getByLabelText('API key').closest('form'));
    expect(onSaveKey).toHaveBeenCalledWith('groq');
  });

  it('a failed save keeps the row open and does not claim Saved', async () => {
    const onSaveKey = vi.fn().mockResolvedValue(false);
    const config = { ...CONFIG, groq: { ...CONFIG.groq, apiKey: 'gsk_new', touched: true } };
    renderWithProviders(<ProvidersBlock {...baseProps({ config, onSaveKey })} />);
    await openRow(/replace key/i, 0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    expect(onSaveKey).toHaveBeenCalled();
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expect(screen.queryByText(/^Saved/)).toBeNull();
  });

  it('Cancel throws the draft away and saves nothing', async () => {
    const onFieldChange = vi.fn();
    const onSaveKey = vi.fn();
    const config = { ...CONFIG, groq: { ...CONFIG.groq, apiKey: 'gsk_new', touched: true } };
    renderWithProviders(<ProvidersBlock {...baseProps({ config, onFieldChange, onSaveKey })} />);
    await openRow(/replace key/i, 0);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onFieldChange).toHaveBeenCalledWith('groq', 'apiKey', '');
    expect(onSaveKey).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText('API key')).toBeNull());
  });

  // Review 2026-11-20: Cancel cleared only the key, so an edited Cloudflare
  // Account ID (and `touched`) outlived it. With the page's discard wired in,
  // Cancel hands the whole row back to the server state.
  it('Cancel discards the whole row through onDiscardDraft when the page provides it', async () => {
    const onFieldChange = vi.fn();
    const onDiscardDraft = vi.fn();
    const config = { ...CONFIG, cloudflare: { ...CONFIG.cloudflare, accountId: 'edited', touched: true } };
    renderWithProviders(<ProvidersBlock {...baseProps({ config, onFieldChange, onDiscardDraft })} />);
    await openRow(/add key/i); // cloudflare
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDiscardDraft).toHaveBeenCalledWith('cloudflare');
    expect(onFieldChange).not.toHaveBeenCalled();
  });

  it('says what to do in words that work on a phone: no "click away"', async () => {
    renderWithProviders(<ProvidersBlock {...baseProps()} />);
    await openRow(/add key/i);
    expect(screen.queryByText(/click away/i)).toBeNull();
    expect(screen.getByText(/Paste the key, then Save key/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^done$/i })).toBeNull();
  });

  it('gives Cloudflare an Account ID field, and nobody else one', async () => {
    const onSaveKey = vi.fn().mockResolvedValue(true);
    const config = { ...CONFIG, cloudflare: { ...CONFIG.cloudflare, accountId: 'acct', touched: true } };
    renderWithProviders(<ProvidersBlock {...baseProps({ config, onSaveKey })} />);
    await openRow(/add key/i); // cloudflare is the only keyless row
    expect(screen.getAllByLabelText('Account ID')).toHaveLength(1);
    // The row saves as a unit, so the account id and the token cannot be
    // half-written; an account id alone is a valid save.
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Save key' }));
    expect(onSaveKey).toHaveBeenCalledWith('cloudflare');
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
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
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

/**
 * What the provider said about our quota.
 *
 * Chef's question, 2026-09-16: is there a way of knowing the rate limits
 * instead of knocking until we trip them? For two of the nine providers there
 * is — groq and together state `x-ratelimit-*` on every response — and the
 * console showed none of it. The other seven send nothing, and the line has to
 * distinguish "no quota left" from "no information", because reading the
 * second as the first is exactly the wrong conclusion.
 */
describe('the quota line', () => {
  const withQuota = (quota) => baseProps({
    status: {
      ...STATUS,
      attention: [],
      catalog: { ...STATUS.catalog, quota },
    },
  });

  it('states the ceiling the provider itself gave', () => {
    renderWithProviders(
      <ProvidersBlock {...withQuota({ groq: { requestsPerMinute: 30, requestsPerDay: 14400 } })} />
    );
    expect(screen.getByText(/30\/min · 14,400\/day/)).toBeInTheDocument();
  });

  it('adds what is left when the headers said', () => {
    renderWithProviders(
      <ProvidersBlock {...withQuota({ groq: { requestsPerMinute: 30, remaining: 17 } })} />
    );
    expect(screen.getByText(/30\/min · 17 left/)).toBeInTheDocument();
  });

  it('says a silent provider is silent, rather than showing it as empty', () => {
    // The distinction that matters: "0 left" and "we were never told" look the
    // same on a dashboard and mean opposite things.
    renderWithProviders(<ProvidersBlock {...withQuota({})} />);
    expect(screen.getAllByText(/sends no rate-limit headers/i).length).toBeGreaterThan(0);
  });

  it('shows nothing for a provider with no key, having never asked it anything', () => {
    renderWithProviders(<ProvidersBlock {...withQuota({})} />);
    // groq and cerebras have keys in CONFIG; cloudflare does not.
    expect(screen.getAllByText(/sends no rate-limit headers/i)).toHaveLength(2);
  });

  it('reports zero remaining as zero, not as unknown', () => {
    renderWithProviders(<ProvidersBlock {...withQuota({ groq: { remaining: 0 } })} />);
    expect(screen.getByText(/0 left/)).toBeInTheDocument();
  });
});

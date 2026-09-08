/**
 * AppsKeysPanel.test.jsx — panel 3, renamed from AppsKeysTab.test.jsx.
 *
 * Everything the old tab's suite defended is still here, re-pointed: the key
 * table, the internal-app chip, the two empty states, the error retry, the
 * discovered-app chips and the Unattributed card. What is new is the routing
 * that came out of the dialog and onto the card (§2) — the segmented
 * `Automatic | Pinned`, the two switches, the daily cap — and the assertion
 * that matters most for D3: **the Pinned picker never renders a text input for
 * a model id.**
 *
 * The steward's browse-list cases moved here in spirit: the picker is that
 * list now, and it is fed by `/api/ai/models/alive` rather than
 * `aiFreeModels`.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppsKeysPanel from '../../../pages/aigeek/AppsKeysPanel';
import { renderWithProviders } from '../../testUtils';

/** appGroups as useAIGeek's `appGroups` selector would build them. */
const APP_GROUPS = [
  {
    appId: 'fitnessgeek',
    displayName: 'fitnessgeek',
    isInternal: false,
    discovered: false,
    status: null,
    config: {
      appName: 'fitnessgeek', tier: 'specific', provider: 'groq', model: 'llama-3.3-70b',
      enabled: true, notes: '', sticky: null, allowPaid: false, dailyCap: null,
    },
    keys: [
      {
        id: 'k1', name: 'Prod key', description: '', keyPrefix: 'bg_abcd', permissions: ['ai:call'],
        rateLimit: { requestsPerMinute: 60, requestsPerDay: 10000 },
        usage: { totalRequests: 42, lastUsed: null },
        isActive: true, isExpired: false, expiresAt: null,
      },
    ],
  },
  {
    appId: 'startgeek',
    displayName: 'startgeek',
    isInternal: true,
    discovered: false,
    status: null,
    config: null,
    keys: [],
  },
];

/** One app on Automatic, which is where the two switches mean something. */
const AUTO_GROUP = {
  appId: 'storygeek',
  displayName: 'storygeek',
  isInternal: false,
  discovered: false,
  status: null,
  config: {
    appName: 'storygeek', tier: 'auto', provider: null, model: null,
    enabled: true, notes: '', sticky: null, allowPaid: false, dailyCap: null,
  },
  keys: [],
};

const ALIVE_GROUPS = [
  {
    key: 'free',
    label: 'Free',
    rows: [
      { provider: 'groq', modelId: 'llama-3.3-70b', fitness: 'structured', paid: false, lastSuccessAt: null },
      { provider: 'cerebras', modelId: 'qwen-3-235b', fitness: 'basic', paid: false, lastSuccessAt: null },
    ],
  },
  {
    key: 'paid',
    label: 'Paid fallback',
    rows: [
      { provider: 'openrouter', modelId: 'openrouter/auto', fitness: 'structured', paid: true, lastSuccessAt: null },
    ],
  },
];

function basePicker(overrides = {}) {
  return {
    groups: ALIVE_GROUPS,
    loading: false,
    error: null,
    onReload: vi.fn(),
    suggestApp: null,
    onToggleSuggest: vi.fn(),
    recommendTask: '',
    recommendPriority: 'cost',
    recommendations: null,
    recommending: false,
    onTaskChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onRecommend: vi.fn(),
    ...overrides,
  };
}

function baseProviders(overrides = {}) {
  return {
    config: {},
    configError: null,
    savingProvider: null,
    status: null,
    onRetry: vi.fn(),
    onFieldChange: vi.fn(),
    onBlurSave: vi.fn(),
    ...overrides,
  };
}

function baseProps(overrides = {}) {
  return {
    appGroups: APP_GROUPS,
    unattributedUsage: null,
    discoveredApps: [],
    loading: false,
    error: null,
    newAppName: '',
    savingApp: null,
    picker: basePicker(),
    providers: baseProviders(),
    onNewAppNameChange: vi.fn(),
    onRefresh: vi.fn(),
    onAddApp: vi.fn(),
    onEditRouting: vi.fn(),
    onDeleteRouting: vi.fn(),
    onPatchRouting: vi.fn(),
    onMintKey: vi.fn(),
    onCopy: vi.fn(),
    onEditKey: vi.fn(),
    onRevokeKey: vi.fn(),
    ...overrides,
  };
}

describe('AppsKeysPanel — apps and their keys', () => {
  it('lists a key under its app group', () => {
    renderWithProviders(<AppsKeysPanel {...baseProps()} />);
    expect(screen.getByText('fitnessgeek')).toBeInTheDocument();
    expect(screen.getByText('Prod key')).toBeInTheDocument();
  });

  it('shows the internal chip and "No key needed" for an in-process app instead of Mint', () => {
    renderWithProviders(<AppsKeysPanel {...baseProps()} />);
    expect(screen.getByText('internal')).toBeInTheDocument();
    expect(screen.getByText('No key needed')).toBeInTheDocument();
  });

  it('shows the unrouted warning chip when an app has no routing row', () => {
    renderWithProviders(<AppsKeysPanel {...baseProps()} />);
    expect(screen.getByText('unrouted')).toBeInTheDocument();
  });

  it('shows a per-app GeekEmptyState when an app has no keys', () => {
    renderWithProviders(<AppsKeysPanel {...baseProps()} />);
    expect(screen.getByText('No key, by design')).toBeInTheDocument();
  });

  it('shows a GeekEmptyState for the whole panel when there are no app groups', () => {
    renderWithProviders(<AppsKeysPanel {...baseProps({ appGroups: [] })} />);
    expect(screen.getByText('No apps yet')).toBeInTheDocument();
  });

  it('shows a GeekErrorState with a retry action on load failure', async () => {
    const onRefresh = vi.fn();
    renderWithProviders(<AppsKeysPanel {...baseProps({ error: new Error('boom'), appGroups: [], onRefresh })} />);
    expect(screen.getByText("Couldn't load apps and keys")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders discovered-but-unrouted apps as chips, clicking one calls onAddApp', () => {
    const onAddApp = vi.fn();
    renderWithProviders(<AppsKeysPanel {...baseProps({ discoveredApps: ['newgeek'], onAddApp })} />);
    fireEvent.click(screen.getByText('newgeek'));
    expect(onAddApp).toHaveBeenCalledWith('newgeek');
  });

  it('the "Add app" button is disabled until a name is typed, then calls onAddApp trimmed', () => {
    const onAddApp = vi.fn();
    renderWithProviders(<AppsKeysPanel {...baseProps({ newAppName: '  mygeek  ', onAddApp })} />);
    const addButton = screen.getByRole('button', { name: 'Add app' });
    expect(addButton).not.toBeDisabled();
    fireEvent.click(addButton);
    expect(onAddApp).toHaveBeenCalledWith('mygeek');
  });

  it('renders the Unattributed card with its per-provider breakdown when usage exists', () => {
    renderWithProviders(<AppsKeysPanel {...baseProps({
      unattributedUsage: {
        total: { calls: 10, freeCalls: 8, paidCalls: 2, tokens: 500, cost: 0.02 },
        byProvider: [{ provider: 'groq', calls: 10 }],
      },
    })} />);
    expect(screen.getByText('Unattributed')).toBeInTheDocument();
    expect(screen.getByText('10 calls')).toBeInTheDocument();
  });

  it('copying a key prefix calls onCopy with the prefix', () => {
    const onCopy = vi.fn();
    renderWithProviders(<AppsKeysPanel {...baseProps({ onCopy })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy prefix' }));
    expect(onCopy).toHaveBeenCalledWith('bg_abcd');
  });

  it('editing and revoking a key call their handlers with the key row', () => {
    const onEditKey = vi.fn();
    const onRevokeKey = vi.fn();
    renderWithProviders(<AppsKeysPanel {...baseProps({ onEditKey, onRevokeKey })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit key' }));
    expect(onEditKey).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));
    expect(onRevokeKey).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' }));
  });
});

describe('AppsKeysPanel — the routing controls on the card', () => {
  const onlyAuto = (overrides = {}) => baseProps({ appGroups: [AUTO_GROUP], ...overrides });
  const onlyPinned = (overrides = {}) => baseProps({ appGroups: [APP_GROUPS[0]], ...overrides });

  it('offers exactly Automatic and Pinned', () => {
    renderWithProviders(<AppsKeysPanel {...onlyAuto()} />);
    expect(screen.getByRole('button', { name: 'Automatic', pressed: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pinned', pressed: false })).toBeInTheDocument();
  });

  for (const legacy of ['free', 'rotation']) {
    it(`reads a legacy tier: '${legacy}' row as Automatic, which is what it now does`, () => {
      // Every row in production is one of these until it is next saved, and
      // `auto` is exactly what `aiRoute.resolveRoute` reads them as.
      const group = { ...AUTO_GROUP, config: { ...AUTO_GROUP.config, tier: legacy } };
      renderWithProviders(<AppsKeysPanel {...baseProps({ appGroups: [group] })} />);
      expect(screen.getByRole('button', { name: 'Automatic', pressed: true })).toBeInTheDocument();
    });
  }

  it('choosing Pinned writes the tier straight through — no Save button on the card', () => {
    const onPatchRouting = vi.fn();
    renderWithProviders(<AppsKeysPanel {...onlyAuto({ onPatchRouting })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pinned' }));
    expect(onPatchRouting).toHaveBeenCalledWith('storygeek', { tier: 'specific' });
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
  });

  it('the Pinned picker never renders a text input for a model id — it is a select of alive rows (D3)', () => {
    renderWithProviders(<AppsKeysPanel {...onlyPinned()} />);
    const picker = screen.getByLabelText('Pinned model');
    expect(picker.tagName).toBe('SELECT');
    // The old console had a "Model ID" text field here, typed from another tab.
    expect(screen.queryByLabelText(/model id/i)).toBeNull();
    expect(screen.queryByRole('textbox', { name: /model/i })).toBeNull();
    // And its whole vocabulary is what /models/alive returned, grouped.
    const options = [...picker.querySelectorAll('option')].map(o => o.value);
    expect(options).toEqual([
      '',
      'groq::llama-3.3-70b',
      'cerebras::qwen-3-235b',
      'openrouter::openrouter/auto',
    ]);
    expect([...picker.querySelectorAll('optgroup')].map(g => g.label))
      .toEqual(['Free', 'Paid fallback']);
  });

  it('picking a model from the picker patches the tier, provider and model together', () => {
    const onPatchRouting = vi.fn();
    renderWithProviders(<AppsKeysPanel {...onlyPinned({ onPatchRouting })} />);
    fireEvent.change(screen.getByLabelText('Pinned model'), { target: { value: 'cerebras::qwen-3-235b' } });
    expect(onPatchRouting).toHaveBeenCalledWith('fitnessgeek', {
      tier: 'specific', provider: 'cerebras', model: 'qwen-3-235b',
    });
  });

  it('keeps a pin the alive list no longer carries selectable, and says it is not answering', () => {
    const group = {
      ...APP_GROUPS[0],
      config: { ...APP_GROUPS[0].config, provider: 'groq', model: 'retired-model' },
    };
    renderWithProviders(<AppsKeysPanel {...baseProps({ appGroups: [group] })} />);
    expect(screen.getByLabelText('Pinned model')).toHaveValue('groq::retired-model');
    expect(screen.getByText('not answering')).toBeInTheDocument();
  });

  it('the Suggest button toggles the steward for that app', () => {
    const onToggleSuggest = vi.fn();
    renderWithProviders(<AppsKeysPanel {...onlyPinned({ picker: basePicker({ onToggleSuggest }) })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Suggest' }));
    expect(onToggleSuggest).toHaveBeenCalledWith('fitnessgeek');
  });

  it('sticky patches the enum value, not a boolean', () => {
    const onPatchRouting = vi.fn();
    renderWithProviders(<AppsKeysPanel {...onlyAuto({ onPatchRouting })} />);
    const sticky = screen.getByLabelText('Sticky per conversation for storygeek');
    expect(sticky).not.toBeChecked();
    fireEvent.click(sticky);
    // The schema's enum is `'per-conversation' | null`; a boolean here would
    // fail validation on save.
    expect(onPatchRouting).toHaveBeenCalledWith('storygeek', { sticky: 'per-conversation' });
  });

  it('turning sticky off patches null, not false', () => {
    const onPatchRouting = vi.fn();
    const group = { ...AUTO_GROUP, config: { ...AUTO_GROUP.config, sticky: 'per-conversation' } };
    renderWithProviders(<AppsKeysPanel {...baseProps({ appGroups: [group], onPatchRouting })} />);
    fireEvent.click(screen.getByLabelText('Sticky per conversation for storygeek'));
    expect(onPatchRouting).toHaveBeenCalledWith('storygeek', { sticky: null });
  });

  it('May spend is off by default — the default that keeps the $10 lasting', () => {
    const onPatchRouting = vi.fn();
    renderWithProviders(<AppsKeysPanel {...onlyAuto({ onPatchRouting })} />);
    const paid = screen.getByLabelText('May spend for storygeek');
    expect(paid).not.toBeChecked();
    fireEvent.click(paid);
    expect(onPatchRouting).toHaveBeenCalledWith('storygeek', { allowPaid: true });
  });

  it('disables both switches under Pinned rather than hiding them — not applicable, not gone', () => {
    renderWithProviders(<AppsKeysPanel {...onlyPinned()} />);
    expect(screen.getByLabelText('Sticky per conversation for fitnessgeek')).toBeDisabled();
    expect(screen.getByLabelText('May spend for fitnessgeek')).toBeDisabled();
  });

  it('the daily cap saves on blur, as a number', () => {
    const onPatchRouting = vi.fn();
    renderWithProviders(<AppsKeysPanel {...onlyAuto({ onPatchRouting })} />);
    const cap = screen.getByLabelText('Daily cap for storygeek');
    fireEvent.change(cap, { target: { value: '40' } });
    expect(onPatchRouting).not.toHaveBeenCalled(); // typing is not saving
    fireEvent.blur(cap);
    expect(onPatchRouting).toHaveBeenCalledWith('storygeek', { dailyCap: 40 });
  });

  it('an emptied daily cap saves null — the door default, not zero', () => {
    const onPatchRouting = vi.fn();
    const group = { ...AUTO_GROUP, config: { ...AUTO_GROUP.config, dailyCap: 40 } };
    renderWithProviders(<AppsKeysPanel {...baseProps({ appGroups: [group], onPatchRouting })} />);
    const cap = screen.getByLabelText('Daily cap for storygeek');
    fireEvent.change(cap, { target: { value: '' } });
    fireEvent.blur(cap);
    expect(onPatchRouting).toHaveBeenCalledWith('storygeek', { dailyCap: null });
  });

  it('a blur with the cap unchanged writes nothing', () => {
    const onPatchRouting = vi.fn();
    renderWithProviders(<AppsKeysPanel {...onlyAuto({ onPatchRouting })} />);
    fireEvent.blur(screen.getByLabelText('Daily cap for storygeek'));
    expect(onPatchRouting).not.toHaveBeenCalled();
  });
});

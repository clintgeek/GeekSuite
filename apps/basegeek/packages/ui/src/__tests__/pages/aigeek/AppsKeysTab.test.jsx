import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppsKeysTab from '../../../pages/aigeek/AppsKeysTab';
import { renderWithProviders } from '../../testUtils';

/** appGroups as useAIGeek's `appGroups` selector would build them from the
 * mocked GET_API_KEYS / GET_AI_APP_CONFIGS queries. */
const APP_GROUPS = [
  {
    appId: 'fitnessgeek',
    displayName: 'fitnessgeek',
    isInternal: false,
    discovered: false,
    config: { appName: 'fitnessgeek', tier: 'specific', provider: 'groq', model: 'llama-3.3-70b', enabled: true, notes: '' },
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
    config: null,
    keys: [],
  },
];

function baseSteward(overrides = {}) {
  return {
    openApp: null,
    freeModels: [],
    freeModelsLoading: false,
    recommendTask: '',
    recommendPriority: 'cost',
    recommendations: null,
    recommending: false,
    onToggle: vi.fn(),
    onTaskChange: vi.fn(),
    onPriorityChange: vi.fn(),
    onRecommend: vi.fn(),
    onPickModel: vi.fn(),
    onLoadFreeModels: vi.fn(),
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
    steward: baseSteward(),
    onNewAppNameChange: vi.fn(),
    onRefresh: vi.fn(),
    onAddApp: vi.fn(),
    onEditRouting: vi.fn(),
    onDeleteRouting: vi.fn(),
    onMintKey: vi.fn(),
    onCopy: vi.fn(),
    onEditKey: vi.fn(),
    onRevokeKey: vi.fn(),
    ...overrides,
  };
}

describe('AppsKeysTab', () => {
  it('lists a key from the (mocked) query, under its app group', () => {
    renderWithProviders(<AppsKeysTab {...baseProps()} />);
    expect(screen.getByText('fitnessgeek')).toBeInTheDocument();
    expect(screen.getByText('Prod key')).toBeInTheDocument();
    expect(screen.getByText('groq/llama-3.3-70b')).toBeInTheDocument();
  });

  it('shows the internal chip and "No key needed" for an in-process app instead of Mint', () => {
    renderWithProviders(<AppsKeysTab {...baseProps()} />);
    expect(screen.getByText('internal')).toBeInTheDocument();
    expect(screen.getByText('No key needed')).toBeInTheDocument();
  });

  it('shows the unrouted warning chip when an app has no routing row', () => {
    renderWithProviders(<AppsKeysTab {...baseProps()} />);
    expect(screen.getByText('unrouted')).toBeInTheDocument();
  });

  it('shows a per-app GeekEmptyState when an app has no keys', () => {
    renderWithProviders(<AppsKeysTab {...baseProps()} />);
    expect(screen.getByText('No key, by design')).toBeInTheDocument();
  });

  it('shows a GeekEmptyState for the whole tab when there are no app groups', () => {
    renderWithProviders(<AppsKeysTab {...baseProps({ appGroups: [] })} />);
    expect(screen.getByText('No apps yet')).toBeInTheDocument();
  });

  it('shows a GeekErrorState with a retry action on load failure', async () => {
    const onRefresh = vi.fn();
    renderWithProviders(<AppsKeysTab {...baseProps({ error: new Error('boom'), appGroups: [], onRefresh })} />);
    expect(screen.getByText("Couldn't load apps and keys")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders discovered-but-unrouted apps as chips, clicking one calls onAddApp', () => {
    const onAddApp = vi.fn();
    renderWithProviders(<AppsKeysTab {...baseProps({ discoveredApps: ['newgeek'], onAddApp })} />);
    fireEvent.click(screen.getByText('newgeek'));
    expect(onAddApp).toHaveBeenCalledWith('newgeek');
  });

  it('the "Add app" button is disabled until a name is typed, then calls onAddApp trimmed', () => {
    const onAddApp = vi.fn();
    renderWithProviders(<AppsKeysTab {...baseProps({ newAppName: '  mygeek  ', onAddApp })} />);
    const addButton = screen.getByRole('button', { name: 'Add app' });
    expect(addButton).not.toBeDisabled();
    fireEvent.click(addButton);
    expect(onAddApp).toHaveBeenCalledWith('mygeek');
  });

  it('renders the Unattributed card with its per-provider breakdown when usage exists', () => {
    renderWithProviders(<AppsKeysTab {...baseProps({
      unattributedUsage: {
        total: { calls: 10, freeCalls: 8, paidCalls: 2, tokens: 500, cost: 0.02 },
        byProvider: [{ provider: 'groq', calls: 10 }],
      },
    })} />);
    expect(screen.getByText('Unattributed')).toBeInTheDocument();
    expect(screen.getByText('10 calls')).toBeInTheDocument();
  });

  it('clicking "Recommend a model" toggles the steward via onToggle', () => {
    const onToggle = vi.fn();
    // Just the one group: with both groups present, "Recommend a model" is
    // ambiguous (each unopened card renders its own copy).
    renderWithProviders(<AppsKeysTab {...baseProps({ appGroups: [APP_GROUPS[0]], steward: baseSteward({ onToggle }) })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Recommend a model' }));
    expect(onToggle).toHaveBeenCalledWith('fitnessgeek');
  });

  it('the "Recommend a free model" flow: typing a task and clicking Recommend calls onRecommend with the steward\'s task/priority', () => {
    const onRecommend = vi.fn();
    const onTaskChange = vi.fn();
    renderWithProviders(<AppsKeysTab {...baseProps({
      appGroups: [APP_GROUPS[0]],
      steward: baseSteward({
        openApp: 'fitnessgeek',
        recommendTask: 'turn a search query into a JSON plan',
        onRecommend,
        onTaskChange,
      }),
    })} />);

    // The steward block is open (openApp matches this group) and shows the task box.
    expect(screen.getByDisplayValue('turn a search query into a JSON plan')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Recommend/ }));
    expect(onRecommend).toHaveBeenCalledTimes(1);
  });

  it('a recommendation returned by the (mocked) aiRecommendModel query renders and is pickable', () => {
    const onPickModel = vi.fn();
    renderWithProviders(<AppsKeysTab {...baseProps({
      appGroups: [APP_GROUPS[0]],
      steward: baseSteward({
        openApp: 'fitnessgeek',
        recommendTask: 'turn a search query into a JSON plan',
        recommendations: [
          { provider: 'groq', modelId: 'llama-3.3-70b', name: 'Llama 3.3 70B', score: 88, contextWindow: 131072, reasoning: 'Fast and cheap.' },
        ],
        onPickModel,
      }),
    })} />);

    expect(screen.getByText('Llama 3.3 70B')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Llama 3.3 70B'));
    // AppsKeysTab's onPickModel wrapper supplies the appId itself.
    expect(onPickModel).toHaveBeenCalledWith('fitnessgeek', 'groq', 'llama-3.3-70b');
  });

  it('copying a key prefix calls onCopy with the prefix', () => {
    const onCopy = vi.fn();
    renderWithProviders(<AppsKeysTab {...baseProps({ onCopy })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy prefix' }));
    expect(onCopy).toHaveBeenCalledWith('bg_abcd');
  });

  it('editing and revoking a key call their handlers with the key row', () => {
    const onEditKey = vi.fn();
    const onRevokeKey = vi.fn();
    renderWithProviders(<AppsKeysTab {...baseProps({ onEditKey, onRevokeKey })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit key' }));
    expect(onEditKey).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));
    expect(onRevokeKey).toHaveBeenCalledWith(expect.objectContaining({ id: 'k1' }));
  });
});

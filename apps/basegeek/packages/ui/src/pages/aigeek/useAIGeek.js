/**
 * useAIGeek — all of the AIGeek page's state and every call it makes.
 *
 * What this replaces: twenty `useState` hooks and fourteen handlers in one
 * 2,200-line component, several of them writing the same strings from
 * different directions. `editingFreeTier`, the bulk `freeTierEdits` map and
 * the advanced dialog all edited the same model's limits, and which one won
 * depended on render order rather than intent.
 *
 * One reducer settles that: every transition is a named action, so the tabs
 * can only move state in ways this file has a name for. The tabs themselves
 * are presentational — they read `state` and call handlers, and none of them
 * knows Apollo exists.
 *
 * Errors split two ways, unchanged from before the split: a *fetch* failure
 * lands in a per-section error slot so the tab can render a `GeekErrorState`
 * with a retry, and everything transient — a save, a sync, a test — is a
 * toast. The page's own toast hook is passed in rather than called here, so
 * the hook stays testable outside a provider.
 */
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { gql } from '@apollo/client';
import { apolloClient } from '../../apolloClient';
import { FREE_TIER_DEFAULTS, UNATTRIBUTED_APP_ID, normalizeAppId } from './format';
import { emptyKeyDraft, keyDraftFrom } from './apiKeyDraft';
import {
  GET_AI_CONFIG,
  GET_AI_STATS,
  GET_AI_DIRECTOR_MODELS,
  GET_AI_APP_CONFIGS,
  GET_API_KEYS,
} from '../../graphql/queries';
import {
  CREATE_API_KEY,
  UPDATE_API_KEY,
  DELETE_API_KEY,
  SAVE_AI_CONFIG,
  TEST_AI_PROVIDER,
  RESET_AI_STATS,
  SYNC_PROVIDER_MODELS,
  UPDATE_MODEL_PRICING,
  UPDATE_MODEL_FREE_TIER,
  RESET_ALL_FREE_TIERS,
  BULK_UPDATE_FREE_TIERS,
  SAVE_AI_APP_CONFIG,
  DELETE_AI_APP_CONFIG,
} from '../../graphql/mutations';

/**
 * The model steward queries, declared here rather than in graphql/queries.js.
 *
 * They are read by exactly one dialog on one page and by nothing else in the
 * app; keeping them next to the hook that runs them means the field list and
 * the state it lands in move together. If a second surface ever needs them,
 * promote them to graphql/queries.js with the rest.
 *
 * Both are authenticated but not admin on the server — an app filling in its
 * own routing has to be able to ask the same questions this page does.
 */
export const GET_AI_FREE_MODELS = gql`
  query GetAIFreeModels {
    aiFreeModels {
      provider
      modelId
      name
      contextWindow
      supportsFunctionCalling
      supportsJSONOutput
      supportsVision
      isFree
      performance { speed quality reasoning }
      freeLimits { requestsPerMinute requestsPerDay tokensPerMinute tokensPerDay }
      pricing { input output }
      notes
      lastSeen
      updatedAt
    }
  }
`;

export const RECOMMEND_AI_MODEL = gql`
  query RecommendAIModel($task: String!, $priority: String, $freeOnly: Boolean, $limit: Int) {
    aiRecommendModel(task: $task, priority: $priority, freeOnly: $freeOnly, limit: $limit) {
      task
      priority
      freeOnly
      requirements {
        needsVision
        needsAudio
        needsFunctionCalling
        needsReasoning
        needsCodeGeneration
        needsJSONOutput
      }
      recommendations {
        provider
        modelId
        name
        reasoning
        score
        isFree
        contextWindow
        supportsFunctionCalling
        supportsJSONOutput
        supportsVision
        performance { speed quality reasoning }
      }
    }
  }
`;

/**
 * The providers this page can configure. Mirrors the server's one list in
 * `packages/api/src/config/aiProviders.js` — the UI is a separate package and
 * cannot import from the API, so this is the one place the roster is repeated;
 * `withKeyDrafts` drops anything the server sends that is not named here.
 *
 * `llm7` and `onemin` were removed 2026-09-04: neither had an implementation
 * in aiService, so a key saved for either went nowhere. `anthropic` was removed
 * 2026-09-07: the account is out of credit and the provider is gone for good,
 * adapter and all.
 */
export const CONFIG_PROVIDERS = [
  'groq', 'gemini', 'together', 'cohere', 'openrouter',
  'cerebras', 'cloudflare', 'ollama', 'llmgateway',
];

/** A provider entry before the server has been heard from. */
const emptyProviderConfig = (provider) => ({
  hasKey: false,
  keyHint: '',
  enabled: false,
  apiKey: '',
  ...(provider === 'cloudflare' ? { accountId: '' } : {}),
});

const emptyConfig = () => Object.fromEntries(
  CONFIG_PROVIDERS.map(provider => [provider, emptyProviderConfig(provider)])
);

/**
 * The server sends `{ hasKey, keyHint, enabled }` and never the credential, so
 * `apiKey` here is a *draft* — whatever the admin has typed into the box this
 * session. Blank means "keep the stored key", which is why Save omits it.
 */
const withKeyDrafts = (serverConfig) => Object.fromEntries(
  CONFIG_PROVIDERS
    .filter(provider => serverConfig?.[provider])
    .map(provider => [provider, {
      ...emptyProviderConfig(provider),
      ...serverConfig[provider],
      apiKey: '',
    }])
);

/** `provider::modelId` — the key a pending free-tier edit is filed under. */
export const freeTierKey = (provider, modelId) => `${provider}::${modelId}`;

/**
 * Apps that reach aiGeek from inside the suite's own process boundary rather
 * than over the wire with a key. Minting a key for one of these would create a
 * credential nothing ever presents, so the console offers a chip instead of a
 * Mint button.
 */
export const INTERNAL_APP_IDS = new Set(['startgeek']);

const initialState = {
  activeTab: 0,
  // The Configuration tab's own busy flag: save, and the per-provider key test.
  loading: false,

  // One error slot per fetch, so a failed load renders a GeekErrorState with a
  // retry in the section that failed. Everything transient is a toast.
  configError: null,
  statsError: null,
  directorError: null,
  appConfigsError: null,

  config: emptyConfig(),

  stats: {
    totalCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    providerUsage: {},
    appUsage: {},
  },

  directorData: null,
  directorLoading: false,
  syncingProvider: null,

  // { "provider::modelId": { isFree?, freeLimits? } } — pending, unsaved.
  freeTierEdits: {},
  savingBulk: false,

  editingPricing: null,
  editingFreeTier: null,

  showResetConfirm: false,
  showResetStatsConfirm: false,

  appConfigs: [],
  discoveredApps: [],
  appConfigsLoading: false,
  editingApp: null,
  newAppName: '',

  // Apps & keys — the API keys that decide which app a call is attributed to.
  apiKeys: [],
  apiKeysLoading: false,
  apiKeysError: null,
  editingKey: null,
  savingKey: false,
  // The plaintext, held exactly as long as the "saved it?" dialog is open.
  newKeyPlaintext: null,
  revokingKey: null,
  revoking: false,
  // Which app group has the inline model steward expanded. One at a time:
  // the steward's task box and its answers are a single slot, and two open
  // blocks fighting over them is how the old page grew its worst bug.
  stewardApp: null,

  // Model steward — the "which free model fits this?" block in the app dialog.
  freeModels: [],
  freeModelsLoaded: false,
  freeModelsLoading: false,
  recommendTask: '',
  recommendPriority: 'cost',
  recommendations: null,
  recommending: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'tab/set':
      return { ...state, activeTab: action.value };

    case 'busy/set':
      return { ...state, loading: action.value };

    // ── Configuration ──────────────────────────────────────────────────────
    case 'config/loading':
      return { ...state, loading: true, configError: null };
    case 'config/loaded':
      return { ...state, loading: false, config: action.config ?? state.config };
    case 'config/failed':
      return { ...state, loading: false, configError: action.error };
    case 'config/field':
      return {
        ...state,
        config: {
          ...state.config,
          [action.provider]: { ...state.config[action.provider], [action.field]: action.value },
        },
      };

    // ── Usage ──────────────────────────────────────────────────────────────
    case 'stats/loaded':
      return { ...state, statsError: null, stats: action.stats ?? state.stats };
    case 'stats/failed':
      return { ...state, statsError: action.error };

    // ── Catalog / director ─────────────────────────────────────────────────
    case 'director/loading':
      return { ...state, directorLoading: true, directorError: null };
    case 'director/loaded':
      return {
        ...state,
        directorLoading: false,
        directorData: action.data ?? state.directorData,
      };
    case 'director/failed':
      return { ...state, directorLoading: false, directorError: action.error };

    case 'sync/start':
      return { ...state, syncingProvider: action.provider };
    case 'sync/end':
      return { ...state, syncingProvider: null };

    case 'bulk/start':
      return { ...state, savingBulk: true };
    case 'bulk/end':
      return { ...state, savingBulk: false };

    // ── Pending free-tier edits ────────────────────────────────────────────
    case 'freeTier/flag': {
      const key = freeTierKey(action.provider, action.modelId);
      return {
        ...state,
        freeTierEdits: {
          ...state.freeTierEdits,
          [key]: { ...(state.freeTierEdits[key] || {}), isFree: action.value },
        },
      };
    }
    case 'freeTier/limit': {
      const key = freeTierKey(action.provider, action.modelId);
      const existing = state.freeTierEdits[key] || {};
      return {
        ...state,
        freeTierEdits: {
          ...state.freeTierEdits,
          [key]: {
            ...existing,
            freeLimits: {
              ...(existing.freeLimits || {}),
              [action.field]: action.value === '' ? undefined : parseInt(action.value) || 0,
            },
          },
        },
      };
    }
    case 'freeTier/clearAll':
      return { ...state, freeTierEdits: {} };
    case 'freeTier/clearOne': {
      const next = { ...state.freeTierEdits };
      delete next[freeTierKey(action.provider, action.modelId)];
      return { ...state, freeTierEdits: next };
    }

    // ── Dialogs ────────────────────────────────────────────────────────────
    case 'pricing/open':
      return { ...state, editingPricing: action.value };
    case 'pricing/patch':
      return { ...state, editingPricing: { ...state.editingPricing, ...action.patch } };
    case 'pricing/close':
      return { ...state, editingPricing: null };

    case 'freeTierDialog/open':
      return { ...state, editingFreeTier: action.value };
    case 'freeTierDialog/patch':
      return { ...state, editingFreeTier: { ...state.editingFreeTier, ...action.patch } };
    case 'freeTierDialog/limit':
      return {
        ...state,
        editingFreeTier: {
          ...state.editingFreeTier,
          freeLimits: { ...state.editingFreeTier?.freeLimits, [action.field]: action.value },
        },
      };
    case 'freeTierDialog/close':
      return { ...state, editingFreeTier: null };

    case 'confirm/set':
      return { ...state, [action.which]: action.open };

    // ── App routing ────────────────────────────────────────────────────────
    case 'apps/loading':
      return { ...state, appConfigsLoading: true, appConfigsError: null };
    case 'apps/loaded':
      return {
        ...state,
        appConfigsLoading: false,
        appConfigs: action.configs,
        discoveredApps: action.discoveredApps,
      };
    case 'apps/failed':
      return { ...state, appConfigsLoading: false, appConfigsError: action.error };
    case 'apps/newName':
      return { ...state, newAppName: action.value };

    case 'appDialog/open':
      return { ...state, editingApp: action.value };
    case 'appDialog/patch':
      return { ...state, editingApp: { ...state.editingApp, ...action.patch } };
    case 'appDialog/close':
      return { ...state, editingApp: null };

    // ── API keys ───────────────────────────────────────────────────────────
    case 'keys/loading':
      return { ...state, apiKeysLoading: true, apiKeysError: null };
    case 'keys/loaded':
      return { ...state, apiKeysLoading: false, apiKeys: action.keys };
    case 'keys/failed':
      return { ...state, apiKeysLoading: false, apiKeysError: action.error };

    case 'keyDialog/open':
      return { ...state, editingKey: action.value };
    case 'keyDialog/patch':
      return { ...state, editingKey: { ...state.editingKey, ...action.patch } };
    case 'keyDialog/rate':
      return {
        ...state,
        editingKey: {
          ...state.editingKey,
          rateLimit: {
            ...state.editingKey?.rateLimit,
            // Keep the box empty while it is being retyped; the save coerces.
            [action.field]: action.value === '' ? '' : parseInt(action.value, 10) || 0,
          },
        },
      };
    case 'keyDialog/close':
      return { ...state, editingKey: null };
    case 'keys/saving':
      return { ...state, savingKey: action.value };

    case 'keys/minted':
      return { ...state, newKeyPlaintext: action.apiKey };
    case 'keys/mintedDismissed':
      return { ...state, newKeyPlaintext: null };

    case 'keys/revokeOpen':
      return { ...state, revokingKey: action.value };
    case 'keys/revokeClose':
      return { ...state, revokingKey: null, revoking: false };
    case 'keys/revoking':
      return { ...state, revoking: action.value };

    // ── Inline steward ─────────────────────────────────────────────────────
    case 'steward/set':
      return { ...state, stewardApp: action.appId };

    // ── Model steward ──────────────────────────────────────────────────────
    case 'freeModels/loading':
      return { ...state, freeModelsLoading: true };
    case 'freeModels/loaded':
      return { ...state, freeModelsLoading: false, freeModelsLoaded: true, freeModels: action.models };
    case 'freeModels/failed':
      return { ...state, freeModelsLoading: false };

    case 'recommend/task':
      return { ...state, recommendTask: action.value };
    case 'recommend/priority':
      return { ...state, recommendPriority: action.value };
    case 'recommend/start':
      return { ...state, recommending: true };
    case 'recommend/loaded':
      return { ...state, recommending: false, recommendations: action.recommendations };
    case 'recommend/failed':
      return { ...state, recommending: false };
    case 'recommend/reset':
      return { ...state, recommendations: null, recommendTask: action.task ?? '' };

    default:
      return state;
  }
}

/**
 * @param {(message: React.ReactNode, options?: object) => void} notify
 *   The page's toast sink. Passed in so this hook has no provider dependency.
 */
export function useAIGeek(notify) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Fetches ──────────────────────────────────────────────────────────────

  const loadConfiguration = useCallback(async () => {
    dispatch({ type: 'config/loading' });
    try {
      const { data } = await apolloClient.query({ query: GET_AI_CONFIG, fetchPolicy: 'network-only' });
      dispatch({ type: 'config/loaded', config: data?.aiConfig ? withKeyDrafts(data.aiConfig) : null });
    } catch (err) {
      dispatch({ type: 'config/failed', error: err });
    }
  }, []);

  const loadStatistics = useCallback(async () => {
    try {
      const { data } = await apolloClient.query({ query: GET_AI_STATS, fetchPolicy: 'network-only' });
      const stats = data?.aiStats ? (data.aiStats.data || data.aiStats) : null;
      dispatch({ type: 'stats/loaded', stats });
    } catch (err) {
      dispatch({ type: 'stats/failed', error: err });
    }
  }, []);

  const loadDirectorData = useCallback(async () => {
    dispatch({ type: 'director/loading' });
    try {
      const { data } = await apolloClient.query({ query: GET_AI_DIRECTOR_MODELS, fetchPolicy: 'network-only' });
      dispatch({ type: 'director/loaded', data: data?.aiDirectorModels ?? null });
    } catch (err) {
      dispatch({ type: 'director/failed', error: err });
    }
  }, []);

  const loadAppConfigs = useCallback(async () => {
    dispatch({ type: 'apps/loading' });
    try {
      const { data } = await apolloClient.query({ query: GET_AI_APP_CONFIGS, fetchPolicy: 'network-only' });
      dispatch({
        type: 'apps/loaded',
        configs: data?.aiAppConfigs?.configs || [],
        discoveredApps: data?.aiAppConfigs?.discoveredApps || [],
      });
    } catch (err) {
      dispatch({ type: 'apps/failed', error: err });
    }
  }, []);

  /**
   * The keys, which are also the app roster.
   *
   * `apiKeys` is scoped server-side to `createdBy: user.id` and `isActive`,
   * and every key mutation is scoped the same way — so this page shows exactly
   * the keys it can act on. A key another admin minted is invisible here and
   * would have been un-editable anyway; the Unattributed bucket and the app
   * routing rows are what surface its traffic.
   */
  const loadApiKeys = useCallback(async () => {
    dispatch({ type: 'keys/loading' });
    try {
      const { data } = await apolloClient.query({ query: GET_API_KEYS, fetchPolicy: 'network-only' });
      dispatch({ type: 'keys/loaded', keys: data?.apiKeys || [] });
    } catch (err) {
      dispatch({ type: 'keys/failed', error: err });
    }
  }, []);

  const loadFreeModels = useCallback(async () => {
    dispatch({ type: 'freeModels/loading' });
    try {
      const { data } = await apolloClient.query({ query: GET_AI_FREE_MODELS, fetchPolicy: 'network-only' });
      dispatch({ type: 'freeModels/loaded', models: data?.aiFreeModels || [] });
    } catch (err) {
      dispatch({ type: 'freeModels/failed' });
      notify(`Couldn't load free models: ${err.message}`, { tone: 'error' });
    }
  }, [notify]);

  useEffect(() => {
    loadConfiguration();
    loadStatistics();
    loadDirectorData();
    loadAppConfigs();
    loadApiKeys();
  }, [loadConfiguration, loadStatistics, loadDirectorData, loadAppConfigs, loadApiKeys]);

  // ── Configuration ────────────────────────────────────────────────────────

  const setConfigField = useCallback((provider, field, value) => {
    dispatch({ type: 'config/field', provider, field, value });
  }, []);

  const saveConfiguration = useCallback(async () => {
    dispatch({ type: 'busy/set', value: true });
    try {
      // Send the toggles for every provider, but a key only where one was
      // actually typed: an omitted key means "keep the stored one", and the
      // client no longer has the stored one to echo back.
      const payload = {};
      for (const [provider, providerConfig] of Object.entries(state.config)) {
        const entry = { enabled: !!providerConfig.enabled };
        if (provider === 'cloudflare') entry.accountId = providerConfig.accountId || '';
        const draftKey = (providerConfig.apiKey || '').trim();
        if (draftKey) entry.apiKey = draftKey;
        payload[provider] = entry;
      }

      await apolloClient.mutate({ mutation: SAVE_AI_CONFIG, variables: { config: payload } });
      notify('AI configuration saved', { tone: 'success' });
      await loadConfiguration(); // re-read the hints and clear the drafts
      await loadStatistics();
    } catch (err) {
      notify(err.message || 'Failed to save AI configuration', { tone: 'error' });
    } finally {
      dispatch({ type: 'busy/set', value: false });
    }
  }, [state.config, notify, loadConfiguration, loadStatistics]);

  const testProvider = useCallback(async (provider) => {
    dispatch({ type: 'busy/set', value: true });
    try {
      const { data } = await apolloClient.mutate({ mutation: TEST_AI_PROVIDER, variables: { provider } });
      if (data?.testAIProvider) {
        notify(`${provider} API key is valid`, { tone: 'success' });
      } else {
        notify(`${provider} API key is invalid`, { tone: 'error' });
      }
    } catch (err) {
      notify(`Failed to test ${provider} API key: ${err.message}`, { tone: 'error' });
    } finally {
      dispatch({ type: 'busy/set', value: false });
    }
  }, [notify]);

  // ── Usage ────────────────────────────────────────────────────────────────

  const resetStatistics = useCallback(async () => {
    try {
      await apolloClient.mutate({ mutation: RESET_AI_STATS });
      notify('Statistics reset', { tone: 'success' });
      dispatch({ type: 'confirm/set', which: 'showResetStatsConfirm', open: false });
      await loadStatistics();
    } catch (err) {
      notify(`Failed to reset statistics: ${err.message}`, { tone: 'error' });
    }
  }, [notify, loadStatistics]);

  // ── Catalog ──────────────────────────────────────────────────────────────

  const syncProviderModels = useCallback(async (provider) => {
    dispatch({ type: 'sync/start', provider });
    try {
      const { data } = await apolloClient.mutate({
        mutation: SYNC_PROVIDER_MODELS,
        variables: { provider },
      });
      const result = data?.syncProviderModels;
      notify(`${provider}: synced ${result?.modelsFound || 0} models from API`, { tone: 'success' });
      await loadDirectorData();
    } catch (err) {
      notify(`Failed to sync ${provider} models: ${err.message}`, { tone: 'error' });
    } finally {
      dispatch({ type: 'sync/end' });
    }
  }, [notify, loadDirectorData]);

  const savePricing = useCallback(async () => {
    const editing = state.editingPricing;
    if (!editing) return;
    try {
      await apolloClient.mutate({
        mutation: UPDATE_MODEL_PRICING,
        variables: {
          provider: editing.provider,
          modelId: editing.modelId,
          inputPrice: parseFloat(editing.inputPrice) || 0,
          outputPrice: parseFloat(editing.outputPrice) || 0,
        },
      });
      notify(`Pricing updated for ${editing.modelId}`, { tone: 'success' });
      dispatch({ type: 'pricing/close' });
      await loadDirectorData();
    } catch (err) {
      notify(`Failed to update pricing: ${err.message}`, { tone: 'error' });
    }
  }, [state.editingPricing, notify, loadDirectorData]);

  /** The advanced dialog: one model, including the audio limits and notes. */
  const saveFreeTier = useCallback(async () => {
    const editing = state.editingFreeTier;
    if (!editing) return;
    try {
      await apolloClient.mutate({
        mutation: UPDATE_MODEL_FREE_TIER,
        variables: {
          provider: editing.provider,
          modelId: editing.modelId,
          isFree: editing.isFree,
          freeLimits: editing.freeLimits || {},
          notes: editing.notes || '',
        },
      });
      notify(`Free tier updated for ${editing.modelId}`, { tone: 'success' });
      // The server now holds the truth for this model, so drop its pending edit
      // rather than leave a dirty row that would re-save the older values.
      dispatch({ type: 'freeTier/clearOne', provider: editing.provider, modelId: editing.modelId });
      dispatch({ type: 'freeTierDialog/close' });
      await loadDirectorData();
    } catch (err) {
      notify(`Failed to update free tier: ${err.message}`, { tone: 'error' });
    }
  }, [state.editingFreeTier, notify, loadDirectorData]);

  const saveAllFreeTiers = useCallback(async () => {
    if (Object.keys(state.freeTierEdits).length === 0) return;
    dispatch({ type: 'bulk/start' });
    try {
      const updates = Object.entries(state.freeTierEdits).map(([key, edit]) => {
        const [provider, modelId] = key.split('::');
        // Merge onto the model's stored limits: an edit that only flipped the
        // checkbox carries no limits and must not blank the ones on record.
        const model = state.directorData?.providers?.[provider]?.models?.find(m => m.id === modelId);
        const originalLimits = model?.freeTier?.limits || {};
        return {
          provider,
          modelId,
          isFree: edit.isFree ?? false,
          freeLimits: edit.freeLimits ? { ...originalLimits, ...edit.freeLimits } : originalLimits,
        };
      });
      await apolloClient.mutate({ mutation: BULK_UPDATE_FREE_TIERS, variables: { updates } });
      notify(`${updates.length} model${updates.length !== 1 ? 's' : ''} updated`, { tone: 'success' });
      dispatch({ type: 'freeTier/clearAll' });
      await loadDirectorData();
    } catch (err) {
      notify(`Failed to save free tier changes: ${err.message}`, { tone: 'error' });
    } finally {
      dispatch({ type: 'bulk/end' });
    }
  }, [state.freeTierEdits, state.directorData, notify, loadDirectorData]);

  const resetAllFreeTiers = useCallback(async () => {
    dispatch({ type: 'bulk/start' });
    try {
      const { data } = await apolloClient.mutate({ mutation: RESET_ALL_FREE_TIERS });
      const count = data?.resetAllFreeTiers ?? 0;
      notify(`Reset ${count} model${count !== 1 ? 's' : ''} to non-free`, { tone: 'success' });
      dispatch({ type: 'confirm/set', which: 'showResetConfirm', open: false });
      dispatch({ type: 'freeTier/clearAll' });
      await loadDirectorData();
    } catch (err) {
      notify(`Failed to reset free tiers: ${err.message}`, { tone: 'error' });
    } finally {
      dispatch({ type: 'bulk/end' });
    }
  }, [notify, loadDirectorData]);

  // `restoreHardcodedDefaults` was here until 2026-09-07: it fired
  // seedDirectorPricing + seedDirectorFreeTier, which wrote ~45 hand-typed
  // prices and ~30 hand-typed quota rows over the catalog. Both mutations were
  // deleted with the tables (Phase 1, DOCS/AIGEEK_ELEVATION_PLAN.md) — the
  // catalog job discovers and probes instead, so there are no defaults to
  // restore. Per-row overrides are still the pricing / free-tier dialogs.

  // ── App routing ──────────────────────────────────────────────────────────

  const saveAppConfig = useCallback(async () => {
    const editing = state.editingApp;
    if (!editing) return;
    try {
      await apolloClient.mutate({
        mutation: SAVE_AI_APP_CONFIG,
        variables: {
          appName: editing.appName,
          config: {
            displayName: editing.displayName || '',
            tier: editing.tier || 'free',
            provider: editing.provider || null,
            model: editing.model || null,
            fallbackOrder: editing.fallbackOrder || [],
            maxTokens: editing.maxTokens ? parseInt(editing.maxTokens) : null,
            temperature: editing.temperature != null && editing.temperature !== ''
              ? parseFloat(editing.temperature)
              : null,
            notes: editing.notes || '',
            enabled: editing.enabled !== false,
          },
        },
      });
      notify(`App config saved for ${editing.appName}`, { tone: 'success' });
      dispatch({ type: 'appDialog/close' });
      await loadAppConfigs();
    } catch (err) {
      notify(`Failed to save app config: ${err.message}`, { tone: 'error' });
    }
  }, [state.editingApp, notify, loadAppConfigs]);

  const deleteAppConfig = useCallback(async (appName) => {
    try {
      await apolloClient.mutate({ mutation: DELETE_AI_APP_CONFIG, variables: { appName } });
      notify(`App config deleted for ${appName}`, { tone: 'success' });
      await loadAppConfigs();
    } catch (err) {
      notify(`Failed to delete app config: ${err.message}`, { tone: 'error' });
    }
  }, [notify, loadAppConfigs]);

  const addDiscoveredApp = useCallback((appName) => {
    dispatch({
      type: 'appDialog/open',
      value: {
        appName,
        displayName: appName,
        tier: 'free',
        provider: null,
        model: null,
        fallbackOrder: [],
        maxTokens: null,
        temperature: null,
        notes: '',
        enabled: true,
      },
    });
  }, []);

  // ── API keys ─────────────────────────────────────────────────────────────

  const openCreateKey = useCallback((appName) => {
    dispatch({ type: 'keyDialog/open', value: emptyKeyDraft(appName) });
  }, []);

  const openEditKey = useCallback((apiKey) => {
    dispatch({ type: 'keyDialog/open', value: keyDraftFrom(apiKey) });
  }, []);

  const patchKey = useCallback((patch) => dispatch({ type: 'keyDialog/patch', patch }), []);
  const patchKeyRate = useCallback(
    (field, value) => dispatch({ type: 'keyDialog/rate', field, value }),
    []
  );
  const closeKeyDialog = useCallback(() => dispatch({ type: 'keyDialog/close' }), []);

  const saveApiKey = useCallback(async () => {
    const editing = state.editingKey;
    if (!editing?.name?.trim()) return;

    // An emptied rate box means "leave it alone", not zero — the server floors
    // every one of these at 1 and would reject a 0.
    const rateLimit = Object.fromEntries(
      Object.entries(editing.rateLimit || {})
        .filter(([, value]) => value !== '' && value != null)
        .map(([field, value]) => [field, Number(value)])
    );
    const expiresAt = editing.expiresAt ? new Date(editing.expiresAt).toISOString() : null;

    dispatch({ type: 'keys/saving', value: true });
    try {
      if (editing.mode === 'create') {
        const { data } = await apolloClient.mutate({
          mutation: CREATE_API_KEY,
          variables: {
            name: editing.name.trim(),
            appName: editing.appName,
            description: editing.description || '',
            permissions: editing.permissions,
            rateLimit,
            expiresAt,
          },
        });
        dispatch({ type: 'keyDialog/close' });
        dispatch({ type: 'keys/minted', apiKey: data?.createAPIKey?.apiKey || null });
        notify(`Key minted for ${editing.appName}`, { tone: 'success' });
      } else {
        await apolloClient.mutate({
          mutation: UPDATE_API_KEY,
          variables: {
            id: editing.id,
            name: editing.name.trim(),
            description: editing.description || '',
            permissions: editing.permissions,
            rateLimit,
            expiresAt,
            isActive: editing.isActive !== false,
          },
        });
        dispatch({ type: 'keyDialog/close' });
        notify(`Key updated for ${editing.appName}`, { tone: 'success' });
      }
      await loadApiKeys();
      await loadAppConfigs();
    } catch (err) {
      notify(err.message || 'Failed to save API key', { tone: 'error' });
    } finally {
      dispatch({ type: 'keys/saving', value: false });
    }
  }, [state.editingKey, notify, loadApiKeys, loadAppConfigs]);

  const revokeApiKey = useCallback(async () => {
    const target = state.revokingKey;
    if (!target) return;
    dispatch({ type: 'keys/revoking', value: true });
    try {
      await apolloClient.mutate({ mutation: DELETE_API_KEY, variables: { id: target.id } });
      notify(`Revoked “${target.name}”`, { tone: 'success' });
      dispatch({ type: 'keys/revokeClose' });
      await loadApiKeys();
    } catch (err) {
      notify(err.message || 'Failed to revoke API key', { tone: 'error' });
      dispatch({ type: 'keys/revoking', value: false });
    }
  }, [state.revokingKey, notify, loadApiKeys]);

  /**
   * The clipboard is best-effort: it is unavailable on an insecure origin and
   * throws rather than resolving false, which used to take the toast with it.
   */
  const copyText = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      notify('Copied to clipboard', { tone: 'success' });
    } catch {
      notify('Clipboard blocked — select and copy the text instead', { tone: 'warning' });
    }
  }, [notify]);

  // ── Model steward ────────────────────────────────────────────────────────

  const runRecommendation = useCallback(async () => {
    const task = state.recommendTask.trim();
    if (!task) return;
    dispatch({ type: 'recommend/start' });
    try {
      const { data } = await apolloClient.query({
        query: RECOMMEND_AI_MODEL,
        variables: { task, priority: state.recommendPriority, freeOnly: true, limit: 3 },
        fetchPolicy: 'network-only',
      });
      dispatch({ type: 'recommend/loaded', recommendations: data?.aiRecommendModel?.recommendations || [] });
    } catch (err) {
      dispatch({ type: 'recommend/failed' });
      notify(`Recommendation failed: ${err.message}`, { tone: 'error' });
    }
  }, [state.recommendTask, state.recommendPriority, notify]);

  /**
   * Choosing a model — from a recommendation row or the browse list — pins the
   * app to it. Tier flips to `specific` because that is the only tier that
   * reads provider/model; leaving it on `free` would save the choice into a
   * field the router never looks at.
   */
  const pickModel = useCallback((provider, modelId) => {
    dispatch({ type: 'appDialog/patch', patch: { tier: 'specific', provider, model: modelId } });
  }, []);

  // Opening the dialog seeds the task box from the app's notes (which is where
  // "what this app asks the model to do" already tends to be written) and
  // clears any recommendation left from the previous app. The catalog is
  // fetched lazily on first open: it is a several-second provider sweep on the
  // server and most visits to this page never open the dialog at all.
  const editingAppName = state.editingApp?.appName;
  const editingAppNotes = state.editingApp?.notes;
  const { freeModelsLoaded, freeModelsLoading } = state;
  useEffect(() => {
    if (!editingAppName) return;
    dispatch({ type: 'recommend/reset', task: editingAppNotes || '' });
    if (!freeModelsLoaded && !freeModelsLoading) loadFreeModels();
    // Keyed on the app being configured, not on every keystroke in the dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAppName]);

  /**
   * The Apps & keys tab's inline steward, which is the same block with a
   * different destination: a pick here goes straight to the saved routing row
   * rather than into an open draft. Toggling the same app closes it.
   */
  const toggleSteward = useCallback((appId) => {
    dispatch({ type: 'steward/set', appId: state.stewardApp === appId ? null : appId });
  }, [state.stewardApp]);

  const stewardApp = state.stewardApp;
  const stewardNotes = state.appConfigs.find(c => normalizeAppId(c.appName) === stewardApp)?.notes;
  useEffect(() => {
    if (!stewardApp) return;
    dispatch({ type: 'recommend/reset', task: stewardNotes || '' });
    if (!freeModelsLoaded && !freeModelsLoading) loadFreeModels();
    // Same rule as the dialog: keyed on which app, not on the task box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stewardApp]);

  /**
   * Pin a model from the inline steward. There may be no routing row yet — an
   * app can arrive here from a key alone — so this writes the whole row through
   * the upsert rather than patching one that might not exist.
   */
  const pinModelForApp = useCallback(async (appId, provider, modelId) => {
    const existing = state.appConfigs.find(c => normalizeAppId(c.appName) === appId);
    try {
      await apolloClient.mutate({
        mutation: SAVE_AI_APP_CONFIG,
        variables: {
          appName: existing?.appName || appId,
          config: {
            displayName: existing?.displayName || '',
            tier: 'specific',
            provider,
            model: modelId,
            fallbackOrder: existing?.fallbackOrder || [],
            maxTokens: existing?.maxTokens ?? null,
            temperature: existing?.temperature ?? null,
            notes: existing?.notes || '',
            enabled: existing?.enabled !== false,
          },
        },
      });
      notify(`${appId} now routes to ${provider}/${modelId}`, { tone: 'success' });
      await loadAppConfigs();
    } catch (err) {
      notify(`Failed to pin the model: ${err.message}`, { tone: 'error' });
    }
  }, [state.appConfigs, notify, loadAppConfigs]);

  // ── Selectors ────────────────────────────────────────────────────────────

  /**
   * What the row should show for a model: the pending edit if there is one,
   * otherwise what the server last said.
   */
  const modelFreeTier = useCallback((provider, model) => {
    const pending = state.freeTierEdits[freeTierKey(provider, model.id)];
    const stored = {
      isFree: model.freeTier?.isFree || false,
      freeLimits: model.freeTier?.limits || {},
    };
    if (pending === undefined) return stored;
    // Merge rather than replace: ticking the checkbox files an edit with no
    // limits in it, and the row must keep showing the stored numbers instead
    // of blanking four fields the user never touched.
    return {
      isFree: pending.isFree ?? stored.isFree,
      freeLimits: { ...stored.freeLimits, ...(pending.freeLimits || {}) },
    };
  }, [state.freeTierEdits]);

  const isModelDirty = useCallback(
    (provider, modelId) => state.freeTierEdits[freeTierKey(provider, modelId)] !== undefined,
    [state.freeTierEdits]
  );

  /** Open the pricing dialog seeded from what the catalog last returned. */
  const openPricingDialog = useCallback((provider, model) => {
    dispatch({
      type: 'pricing/open',
      value: {
        provider,
        modelId: model.id,
        modelName: model.name,
        inputPrice: typeof model.pricing?.input === 'number' ? model.pricing.input : 0,
        outputPrice: typeof model.pricing?.output === 'number' ? model.pricing.output : 0,
      },
    });
  }, []);

  /**
   * Open the advanced free-tier dialog seeded from what the *row* currently
   * shows — pending edit included — so opening it never silently discards an
   * unsaved tick. A model with no limits on record starts from the defaults.
   */
  const openFreeTierDialog = useCallback((provider, model) => {
    const current = modelFreeTier(provider, model);
    dispatch({
      type: 'freeTierDialog/open',
      value: {
        provider,
        modelId: model.id,
        modelName: model.name,
        isFree: current.isFree,
        freeLimits: Object.keys(current.freeLimits || {}).length ? current.freeLimits : FREE_TIER_DEFAULTS,
        notes: model.freeTier?.notes || '',
      },
    });
  }, [modelFreeTier]);

  const dirtyCount = useMemo(
    () => Object.keys(state.freeTierEdits).length,
    [state.freeTierEdits]
  );

  /**
   * The Apps & keys roster: one group per normalized app id, from three
   * sources that each know something the others don't.
   *
   * - **API keys** are the authority on identity. aiGeek resolves the caller
   *   from the key's `appName`, so a key is what makes an app real.
   * - **Routing rows** say where that app's calls go. A row can exist with no
   *   key — `startgeek` calls in-process and never presents one.
   * - **Discovered apps** are names seen in traffic with neither of the above
   *   yet, kept so the admin can start a row from one tap.
   *
   * Ordering: apps with keys first (those are the ones being administered),
   * then alphabetical inside each half.
   */
  const appGroups = useMemo(() => {
    const groups = new Map();
    const ensure = (appId) => {
      if (!groups.has(appId)) {
        groups.set(appId, { appId, config: null, keys: [], discovered: false });
      }
      return groups.get(appId);
    };

    for (const config of state.appConfigs) {
      ensure(normalizeAppId(config.appName)).config = config;
    }
    for (const key of state.apiKeys) {
      ensure(normalizeAppId(key.appName)).keys.push(key);
    }
    for (const appName of state.discoveredApps) {
      ensure(normalizeAppId(appName)).discovered = true;
    }
    // The unattributed bucket is not an app and gets its own section.
    groups.delete(UNATTRIBUTED_APP_ID);
    groups.delete('');

    return [...groups.values()]
      .map(group => ({
        ...group,
        displayName: group.config?.displayName || group.appId,
        isInternal: INTERNAL_APP_IDS.has(group.appId),
        keys: [...group.keys].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      }))
      .sort((a, b) => {
        if ((a.keys.length > 0) !== (b.keys.length > 0)) return a.keys.length > 0 ? -1 : 1;
        return a.appId.localeCompare(b.appId);
      });
  }, [state.appConfigs, state.apiKeys, state.discoveredApps]);

  /**
   * Everything aiGeek recorded that it could not attribute to an app, summed
   * across providers. Returns null when the server exposes no such bucket —
   * an empty Unattributed card is worse than none, because it reads as a
   * claim that nothing is unattributed rather than "nobody is counting".
   */
  const unattributedUsage = useMemo(() => {
    const providers = Object.entries(state.stats.providerUsage || {});
    const rows = providers
      .map(([provider, usage]) => [provider, usage.appUsage?.[UNATTRIBUTED_APP_ID]])
      .filter(([, usage]) => usage);
    if (rows.length === 0) return null;

    const total = rows.reduce((acc, [, usage]) => ({
      calls: acc.calls + (usage.calls || 0),
      freeCalls: acc.freeCalls + (usage.freeCalls || 0),
      paidCalls: acc.paidCalls + (usage.paidCalls || 0),
      tokens: acc.tokens + (usage.tokens || 0),
      cost: acc.cost + (usage.cost || 0),
    }), { calls: 0, freeCalls: 0, paidCalls: 0, tokens: 0, cost: 0 });

    return { total, byProvider: rows.map(([provider, usage]) => ({ provider, ...usage })) };
  }, [state.stats]);

  return {
    state,
    dispatch,
    // fetches
    loadConfiguration,
    loadStatistics,
    loadDirectorData,
    loadAppConfigs,
    loadApiKeys,
    loadFreeModels,
    // configuration
    setConfigField,
    saveConfiguration,
    testProvider,
    // usage
    resetStatistics,
    // catalog
    syncProviderModels,
    savePricing,
    saveFreeTier,
    saveAllFreeTiers,
    resetAllFreeTiers,
    // app routing
    saveAppConfig,
    deleteAppConfig,
    addDiscoveredApp,
    // api keys
    openCreateKey,
    openEditKey,
    patchKey,
    patchKeyRate,
    closeKeyDialog,
    saveApiKey,
    revokeApiKey,
    copyText,
    // steward
    runRecommendation,
    pickModel,
    toggleSteward,
    pinModelForApp,
    // dialogs
    openPricingDialog,
    openFreeTierDialog,
    // selectors
    modelFreeTier,
    isModelDirty,
    dirtyCount,
    appGroups,
    unattributedUsage,
  };
}

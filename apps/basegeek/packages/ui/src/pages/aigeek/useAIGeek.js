/**
 * useAIGeek — all of the AIGeek status page's state and every call it makes.
 *
 * What this replaces: twenty `useState` hooks and fourteen handlers in one
 * 2,200-line component, several of them writing the same strings from
 * different directions. One reducer settles that: every transition is a named
 * action, so the panels can only move state in ways this file has a name for.
 * The panels themselves are presentational — they read `state` and call
 * handlers, and none of them knows Apollo or axios exists.
 *
 * Phase 3 (DOCS/AIGEEK_STATUS_PAGE.md) kept the reducer and cut what fed it.
 * Gone with the tabs:
 *
 *   - `CONFIG_PROVIDERS` — a hand-typed copy of the server's roster, which is
 *     how `llm7` stayed in the list for months after it was retired. The
 *     roster is now whatever keys `aiConfig` returns; the server owns it
 *     (`packages/api/src/config/aiProviders.js`) and the UI reads it.
 *   - `freeTierEdits` / `savingBulk` / the pricing and free-tier dialogs /
 *     `syncProviderModels` / `resetAllFreeTiers` — every one of them edited
 *     something the catalog job now observes (AIGEEK_CATALOG_JOB.md). The
 *     catalog is read-only here.
 *   - `testProvider` — the chip on the provider row is the test. A key that
 *     no model answers under shows up in `attention` as `provider_dead`,
 *     which is the same question asked by the system rather than by a button.
 *   - `saveConfiguration` (all providers at once) — replaced by
 *     `saveProviderKey`, one row, on blur. A Save-all across nine providers
 *     was one button that could fail for a reason belonging to one of them.
 *
 * New: `GET /api/ai/status` (the one round trip behind Needs attention and
 * the spend line, polled every 60 s while the tab is visible),
 * `GET /api/ai/models/alive` (the Pinned picker's list — nobody types a model
 * id, D4), and `POST /api/ai/catalog/run` (the `discovery_stale` action).
 *
 * Errors split two ways, unchanged: a *fetch* failure lands in a per-section
 * error slot so the panel can render a `GeekErrorState` with a retry, and
 * everything transient — a save, a run — is a toast. The page's own toast hook
 * is passed in rather than called here, so the hook stays testable outside a
 * provider.
 */
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { gql } from '@apollo/client';
import { apolloClient } from '../../apolloClient';
import api from '../../api';
import { UNATTRIBUTED_APP_ID, normalizeAppId } from './format';
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
  REMOVE_AI_PROVIDER_KEY,
  RESET_AI_STATS,
  SAVE_AI_APP_CONFIG,
  DELETE_AI_APP_CONFIG,
  SET_CATALOG_OVERRIDE,
} from '../../graphql/mutations';

/**
 * The model steward's one surviving query, declared here rather than in
 * graphql/queries.js.
 *
 * It is read by exactly one block on one page and by nothing else in the app;
 * keeping it next to the hook that runs it means the field list and the state
 * it lands in move together. If a second surface ever needs it, promote it to
 * graphql/queries.js with the rest.
 *
 * `aiFreeModels` went with the steward's "Browse free models" select in Phase
 * 3: the Pinned picker is that list now, and it reads `/api/ai/models/alive`,
 * which is what *selection* reads. Two model lists that could disagree about
 * which rows are alive is the bug this page keeps re-growing.
 *
 * Authenticated but not admin on the server — an app filling in its own
 * routing has to be able to ask the same question this page does.
 */
export const RECOMMEND_AI_MODEL = gql`
  query RecommendAIModel($task: String!, $priority: String, $freeOnly: Boolean, $limit: Int) {
    aiRecommendModel(task: $task, priority: $priority, freeOnly: $freeOnly, limit: $limit) {
      task
      priority
      freeOnly
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

/** How often the status endpoint is re-read while the tab is visible (§2). */
export const STATUS_POLL_MS = 60_000;

/**
 * The dom id a provider's key field registers under.
 *
 * Exported because it is a contract between two panels: the attention item
 * that says "Open provider" and the provider row that has to be there when it
 * scrolls. Neither should be spelling this out itself.
 */
export const providerAnchorId = (provider) => `provider-${provider}`;

/**
 * A provider entry before the server has been heard from.
 *
 * The server sends `{ hasKey, keyHint, enabled }` and never the credential, so
 * `apiKey` here is a *draft* — whatever the admin has typed into the box this
 * session. Blank means "keep the stored key", which is why a save omits it.
 */
const emptyProviderConfig = () => ({ hasKey: false, keyHint: '', enabled: false, apiKey: '', touched: false });

/**
 * The roster, straight from what `aiConfig` returned, with a blank draft
 * field added to each row. No filtering: a provider the server knows about and
 * this file does not is a provider whose key nobody could ever paste.
 */
const withKeyDrafts = (serverConfig) => Object.fromEntries(
  Object.entries(serverConfig || {}).map(([provider, entry]) => [provider, {
    ...emptyProviderConfig(),
    ...entry,
    apiKey: '',
    touched: false,
  }])
);

/**
 * Apps that reach aiGeek from inside the suite's own process boundary rather
 * than over the wire with a key. Minting a key for one of these would create a
 * credential nothing ever presents, so the console offers a chip instead of a
 * Mint button.
 */
export const INTERNAL_APP_IDS = new Set(['startgeek']);

/** The two live routing modes, as the segmented control spells them. */
export const AUTOMATIC = 'auto';
export const PINNED = 'specific';

/**
 * Read any stored tier as one of the two live modes.
 *
 * `free` and `rotation` are Phase 2 legacy and are *read* as `auto`, which is
 * what `aiRoute.resolveRoute` does with them (models/AIAppConfig.js). A
 * control with no matching value would render blank and then silently rewrite
 * the row to whatever its first option is.
 */
export const routingMode = (tier) => (tier === PINNED ? PINNED : AUTOMATIC);

const initialState = {
  // ── GET /api/ai/status: panel 1, and the top line of panel 2 ─────────────
  status: null,
  statusError: null,
  statusLoading: false,
  // True from the moment `POST /catalog/run` is accepted until the next status
  // poll comes back — §2's "running…".
  discoveryRunning: false,

  // ── GET /api/ai/models/alive: the Pinned picker's whole vocabulary ───────
  aliveModels: [],
  aliveLoaded: false,
  aliveLoading: false,
  aliveError: null,

  // One error slot per fetch, so a failed load renders a GeekErrorState with a
  // retry in the section that failed. Everything transient is a toast.
  configError: null,
  statsError: null,
  directorError: null,
  appConfigsError: null,

  // { [provider]: { hasKey, keyHint, enabled, apiKey, accountId? } } — the
  // roster as the server reports it, plus this session's key drafts.
  config: {},
  configLoading: false,
  // Which provider row is mid-save, so exactly that row shows a spinner.
  savingProvider: null,

  stats: {
    totalCalls: 0,
    totalTokens: 0,
    totalCost: 0,
    providerUsage: {},
    appUsage: {},
  },

  directorData: null,
  directorLoading: false,

  showResetStatsConfirm: false,

  appConfigs: [],
  discoveredApps: [],
  appConfigsLoading: false,
  editingApp: null,
  newAppName: '',
  // Which app row is mid-save. The card's controls write straight through, so
  // this is what stops a second click before the first has landed.
  savingApp: null,

  // Apps and keys — the API keys that decide which app a call is attributed to.
  apiKeys: [],
  apiKeysLoading: false,
  apiKeysError: null,
  editingKey: null,
  savingKey: false,
  // The plaintext, held exactly as long as the "saved it?" dialog is open.
  newKeyPlaintext: null,
  revokingKey: null,
  revoking: false,

  // Which of the two collapsed sections at the bottom are open (§2).
  openSections: { catalog: false, 'try-it': false },

  // The catalog's per-row override drawer: `{ provider, modelId, name }`.
  overrideRow: null,

  // The steward, now a "Suggest" button inside the Pinned picker. One slot,
  // and `suggestApp` says whose picker owns it — two open blocks fighting over
  // one task box is how the old page grew its worst bug.
  suggestApp: null,
  recommendTask: '',
  recommendPriority: 'cost',
  recommendations: null,
  recommending: false,
};

function reducer(state, action) {
  switch (action.type) {
    // ── Status ─────────────────────────────────────────────────────────────
    case 'status/loading':
      return { ...state, statusLoading: true };
    case 'status/loaded':
      return {
        ...state,
        statusLoading: false,
        statusError: null,
        status: action.status,
        // A poll has landed, so whatever "running…" was waiting for has been
        // asked and answered — even when the answer is "still the old run".
        discoveryRunning: false,
      };
    case 'status/failed':
      return { ...state, statusLoading: false, statusError: action.error, discoveryRunning: false };
    case 'discovery/started':
      return { ...state, discoveryRunning: true };

    // ── Alive models ───────────────────────────────────────────────────────
    case 'alive/loading':
      return { ...state, aliveLoading: true, aliveError: null };
    case 'alive/loaded':
      return { ...state, aliveLoading: false, aliveLoaded: true, aliveModels: action.models };
    case 'alive/failed':
      return { ...state, aliveLoading: false, aliveError: action.error };

    // ── Providers ──────────────────────────────────────────────────────────
    case 'config/loading':
      return { ...state, configLoading: true, configError: null };
    case 'config/loaded':
      return { ...state, configLoading: false, config: action.config ?? state.config };
    case 'config/failed':
      return { ...state, configLoading: false, configError: action.error };
    case 'config/field':
      return {
        ...state,
        config: {
          ...state.config,
          [action.provider]: {
            ...state.config[action.provider],
            [action.field]: action.value,
            // `touched` is what makes save-on-blur safe. The server never
            // sends a credential back, so an *untouched* key box is empty on
            // every row that has a key — and blur fires on every tab-through.
            // Without this marker, keyboard-traversing the provider list
            // would read as "the admin emptied nine key boxes".
            touched: true,
          },
        },
      };
    case 'config/saving':
      return { ...state, savingProvider: action.provider };

    // ── Usage ──────────────────────────────────────────────────────────────
    case 'stats/loaded':
      return { ...state, statsError: null, stats: action.stats ?? state.stats };
    case 'stats/failed':
      return { ...state, statsError: action.error };

    // ── Catalog (read-only) ────────────────────────────────────────────────
    case 'director/loading':
      return { ...state, directorLoading: true, directorError: null };
    case 'director/loaded':
      return { ...state, directorLoading: false, directorData: action.data ?? state.directorData };
    case 'director/failed':
      return { ...state, directorLoading: false, directorError: action.error };

    case 'override/open':
      return { ...state, overrideRow: action.value };
    case 'override/close':
      return { ...state, overrideRow: null };

    case 'confirm/set':
      return { ...state, [action.which]: action.open };

    case 'section/toggle':
      return {
        ...state,
        openSections: { ...state.openSections, [action.id]: !state.openSections[action.id] },
      };
    case 'section/open':
      return { ...state, openSections: { ...state.openSections, [action.id]: true } };

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
    case 'apps/saving':
      return { ...state, savingApp: action.appId };

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

    // ── Suggest (the steward, inside the Pinned picker) ─────────────────────
    case 'suggest/set':
      return {
        ...state,
        suggestApp: action.appId,
        // A fresh host gets a fresh answer slot, seeded from that app's notes.
        recommendations: null,
        recommendTask: action.appId ? (action.task ?? '') : '',
      };
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

    default:
      return state;
  }
}

/** The message off an axios error, without the "Request failed with status" noise. */
const restMessage = (err, fallback) =>
  err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || fallback;

/**
 * @param {(message: React.ReactNode, options?: object) => void} notify
 *   The page's toast sink. Passed in so this hook has no provider dependency.
 */
export function useAIGeek(notify) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // ── Fetches ──────────────────────────────────────────────────────────────

  /**
   * The status round trip. Cheap by contract — the server caches it for 60 s
   * (§1) — so the poll below can be dumb about when it fires.
   *
   * `silent` is what the poll passes: a background refresh must not flash a
   * spinner over a panel the admin is reading.
   */
  const loadStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) dispatch({ type: 'status/loading' });
    try {
      const { data } = await api.get('/ai/status');
      dispatch({ type: 'status/loaded', status: data?.data ?? data ?? null });
    } catch (err) {
      dispatch({ type: 'status/failed', error: err });
    }
  }, []);

  const loadAliveModels = useCallback(async () => {
    dispatch({ type: 'alive/loading' });
    try {
      // A bare array, not the `{success, data}` envelope — see the route's
      // own note. Read both anyway: one endpoint changing shape should not
      // empty a picker.
      const { data } = await api.get('/ai/models/alive');
      dispatch({ type: 'alive/loaded', models: Array.isArray(data) ? data : (data?.data ?? []) });
    } catch (err) {
      dispatch({ type: 'alive/failed', error: err });
    }
  }, []);

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

  useEffect(() => {
    loadStatus();
    loadAliveModels();
    loadConfiguration();
    loadStatistics();
    loadDirectorData();
    loadAppConfigs();
    loadApiKeys();
  }, [loadStatus, loadAliveModels, loadConfiguration, loadStatistics, loadDirectorData, loadAppConfigs, loadApiKeys]);

  /**
   * Poll the status every 60 s **while visible** (§2).
   *
   * A background tab polling a status endpoint all afternoon is how a page
   * left open on a second monitor becomes a load pattern. The tick checks
   * visibility rather than tearing the interval down, and coming back to the
   * tab refreshes immediately — a stale "Nothing needs you" is the one thing
   * this panel must never show.
   */
  useEffect(() => {
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const id = setInterval(() => { if (visible()) loadStatus({ silent: true }); }, STATUS_POLL_MS);
    if (typeof document === 'undefined') return () => clearInterval(id);

    const onVisibility = () => { if (visible()) loadStatus({ silent: true }); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadStatus]);

  // ── Providers ────────────────────────────────────────────────────────────

  const setConfigField = useCallback((provider, field, value) => {
    dispatch({ type: 'config/field', provider, field, value });
  }, []);

  /**
   * Save one provider's key (and Cloudflare's account id), on blur.
   *
   * The whole provider onboarding, and the whole offboarding: a key present
   * means enabled, an emptied box means disabled. There is no Enabled switch
   * to disagree with the key, which is what the old Configuration tab's
   * Enable + Test + Save ritual made possible.
   *
   * An untouched row is a no-op — see the `touched` note on `config/field`.
   *
   * Note what "disable" can and cannot mean here: `saveAIConfig` treats a
   * blank `apiKey` as "keep the stored one" (it has to — the client cannot
   * read a credential back to echo it), so emptying the box writes
   * `enabled: false` rather than deleting the row's key. The provider stops
   * being reachable, which is the effect §2 asks for; the credential itself
   * outlives it until the API grows a way to clear one.
   */
  const saveProviderKey = useCallback(async (provider) => {
    const entry = state.config[provider];
    if (!entry?.touched) return;

    const draft = (entry.apiKey || '').trim();
    // A blank draft saves nothing. It used to send `enabled: false`, which
    // switched the provider off while the server kept the key and the chip
    // kept counting catalog rows — "I cleared it and nothing happened" (Chef,
    // 2026-09-08). Stopping a provider is `removeProviderKey`, one button.
    if (!draft && provider !== 'cloudflare') return;
    if (!draft && provider === 'cloudflare' && !entry.accountId) return;
    dispatch({ type: 'config/saving', provider });
    try {
      const payload = { [provider]: { enabled: true } };
      if (draft) payload[provider].apiKey = draft;
      if (provider === 'cloudflare') payload[provider].accountId = entry.accountId || '';

      await apolloClient.mutate({ mutation: SAVE_AI_CONFIG, variables: { config: payload } });
      notify(draft ? `${provider} key saved` : `${provider} account id saved`, { tone: 'success' });
      await loadConfiguration(); // re-read the hint, clear the draft and `touched`
      // The chip on this row comes from the status endpoint, and a key paste
      // should light it up without waiting out the poll (§5, "a key paste
      // shows a chip within one status poll").
      await loadStatus({ silent: true });
    } catch (err) {
      notify(err.message || `Failed to save ${provider}`, { tone: 'error' });
    } finally {
      dispatch({ type: 'config/saving', provider: null });
    }
  }, [state.config, notify, loadConfiguration, loadStatus]);

  /** Delete a provider's stored credential; the service stops using it at once. */
  const removeProviderKey = useCallback(async (provider) => {
    dispatch({ type: 'config/saving', provider });
    try {
      await apolloClient.mutate({ mutation: REMOVE_AI_PROVIDER_KEY, variables: { provider } });
      notify(`${provider} key removed — the provider is no longer used`, { tone: 'warning' });
      await loadConfiguration();
      await loadStatus({ silent: true });
    } catch (err) {
      notify(err.message || `Failed to remove the ${provider} key`, { tone: 'error' });
    } finally {
      dispatch({ type: 'config/saving', provider: null });
    }
  }, [notify, loadConfiguration, loadStatus]);

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

  // ── Needs attention ──────────────────────────────────────────────────────

  /**
   * `discovery_stale` → "Run discovery now". Fire-and-forget by design: the
   * route answers `202 { started: true }` and the job runs out of band for
   * minutes, so the only honest thing the button can say afterwards is
   * "running…".
   *
   * Two sources feed that label. `discoveryRunning` below covers the gap
   * between this POST and the next poll; after that the server's own
   * `status.catalog.running` takes over, which is why the poll clears the
   * local flag rather than holding it on a timer.
   *
   * A `409 { started: false, reason: 'running' }` is not a failure — a tick
   * was already in flight, which is exactly the state the button was asking
   * for — so it sets the same flag and says so.
   */
  const runDiscovery = useCallback(async () => {
    try {
      await api.post('/ai/catalog/run');
      dispatch({ type: 'discovery/started' });
      notify('Discovery started — the catalog updates as it goes', { tone: 'success' });
    } catch (err) {
      if (err?.response?.status === 409) {
        dispatch({ type: 'discovery/started' });
        notify('A discovery is already running', { tone: 'info' });
        return;
      }
      notify(`Couldn't start discovery: ${restMessage(err, 'the route refused')}`, { tone: 'error' });
    }
  }, [notify]);

  // ── App routing ──────────────────────────────────────────────────────────

  /** Everything `saveAIAppConfig` accepts, from a row plus a patch over it. */
  const appConfigPayload = (row, patch) => {
    const merged = { ...row, ...patch };
    const tier = routingMode(merged.tier);
    return {
      displayName: merged.displayName || '',
      tier,
      // Only `specific` reads these two, and the resolver nulls them under
      // `auto` anyway — sending them regardless keeps a pin recoverable if
      // the mode is flipped back within one session.
      provider: tier === PINNED ? (merged.provider || null) : null,
      model: tier === PINNED ? (merged.model || null) : null,
      sticky: merged.sticky === 'per-conversation' ? 'per-conversation' : null,
      allowPaid: merged.allowPaid === true,
      dailyCap: merged.dailyCap === '' || merged.dailyCap == null
        ? null
        : parseInt(merged.dailyCap, 10) || null,
      fallbackOrder: merged.fallbackOrder || [],
      maxTokens: merged.maxTokens ? parseInt(merged.maxTokens, 10) : null,
      temperature: merged.temperature != null && merged.temperature !== ''
        ? parseFloat(merged.temperature)
        : null,
      notes: merged.notes || '',
      enabled: merged.enabled !== false,
    };
  };

  const saveAppConfig = useCallback(async () => {
    const editing = state.editingApp;
    if (!editing) return;
    try {
      await apolloClient.mutate({
        mutation: SAVE_AI_APP_CONFIG,
        variables: { appName: editing.appName, config: appConfigPayload(editing, {}) },
      });
      notify(`Routing saved for ${editing.appName}`, { tone: 'success' });
      dispatch({ type: 'appDialog/close' });
      await loadAppConfigs();
      await loadStatus({ silent: true }); // an `unrouted_app` item just cleared
    } catch (err) {
      notify(`Failed to save app config: ${err.message}`, { tone: 'error' });
    }
  }, [state.editingApp, notify, loadAppConfigs, loadStatus]);

  /**
   * Write one field of one app's routing row, straight through.
   *
   * This is what the app card's segmented control, its two switches and its
   * daily cap all call. There is no Save button on the card because a switch
   * that needs one is a chore, and this page is meant to have none. It is an
   * upsert rather than a patch: an app can arrive here from a key alone, with
   * no row to patch.
   */
  const patchAppConfig = useCallback(async (appId, patch) => {
    const existing = state.appConfigs.find(c => normalizeAppId(c.appName) === appId);
    dispatch({ type: 'apps/saving', appId });
    try {
      await apolloClient.mutate({
        mutation: SAVE_AI_APP_CONFIG,
        variables: {
          appName: existing?.appName || appId,
          config: appConfigPayload(existing || { appName: appId, displayName: appId }, patch),
        },
      });
      await loadAppConfigs();
    } catch (err) {
      notify(`Failed to save ${appId}: ${err.message}`, { tone: 'error' });
    } finally {
      dispatch({ type: 'apps/saving', appId: null });
    }
  }, [state.appConfigs, notify, loadAppConfigs]);

  const deleteAppConfig = useCallback(async (appName) => {
    try {
      await apolloClient.mutate({ mutation: DELETE_AI_APP_CONFIG, variables: { appName } });
      notify(`Routing removed for ${appName}`, { tone: 'success' });
      await loadAppConfigs();
    } catch (err) {
      notify(`Failed to delete app config: ${err.message}`, { tone: 'error' });
    }
  }, [notify, loadAppConfigs]);

  /**
   * The override drawer's write: 'deny' takes a row out of selection, 'allow'
   * keeps it a candidate through a cooling spell, null hands it back to the
   * job. Both switches map onto this one mutation — flipping one off clears
   * the field rather than stacking the other on.
   */
  const setCatalogOverride = useCallback(async (row, override) => {
    try {
      await apolloClient.mutate({
        mutation: SET_CATALOG_OVERRIDE,
        variables: { provider: row.provider, modelId: row.modelId, override },
      });
      const word = override === 'deny' ? 'never picked' : override === 'allow' ? 'always allowed' : 'back to observed';
      notify(`${row.modelId} is ${word}`, { tone: 'success' });
      await loadDirectorData();
      await loadAliveModels();
    } catch (err) {
      notify(`Override failed: ${err.message}`, { tone: 'error' });
    }
  }, [notify, loadDirectorData, loadAliveModels]);

  /**
   * Open the routing dialog for an app that has no row yet.
   *
   * `tier: 'auto'` is the default and the one the server auto-discovers with,
   * so the dialog and the row it is about to overwrite agree. This is also
   * what the `unrouted_app` attention item's "Add routing" opens (§2).
   */
  const addDiscoveredApp = useCallback((appName) => {
    dispatch({
      type: 'appDialog/open',
      value: {
        appName,
        displayName: appName,
        tier: AUTOMATIC,
        provider: null,
        model: null,
        sticky: null,
        allowPaid: false,
        dailyCap: null,
        fallbackOrder: [],
        maxTokens: null,
        temperature: null,
        notes: '',
        enabled: true,
      },
    });
  }, []);

  const editAppConfig = useCallback((group) => {
    if (group?.config) dispatch({ type: 'appDialog/open', value: { ...group.config } });
    else addDiscoveredApp(group?.appId || group?.appName || '');
  }, [addDiscoveredApp]);

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
      // A minted or re-dated key can clear a `key_expiring` item.
      await loadStatus({ silent: true });
    } catch (err) {
      notify(err.message || 'Failed to save API key', { tone: 'error' });
    } finally {
      dispatch({ type: 'keys/saving', value: false });
    }
  }, [state.editingKey, notify, loadApiKeys, loadAppConfigs, loadStatus]);

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

  // ── Suggest ──────────────────────────────────────────────────────────────

  /**
   * Open or close the Suggest block for one app's Pinned picker. Toggling the
   * same app closes it; the task box is seeded from that app's notes, which is
   * where "what this app asks the model to do" already tends to be written.
   */
  const toggleSuggest = useCallback((appId) => {
    if (state.suggestApp === appId) {
      dispatch({ type: 'suggest/set', appId: null });
      return;
    }
    const row = state.appConfigs.find(c => normalizeAppId(c.appName) === appId);
    dispatch({ type: 'suggest/set', appId, task: row?.notes || '' });
  }, [state.suggestApp, state.appConfigs]);

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

  // ── Scrolling to a section, which two attention actions need ─────────────

  /**
   * The anchor nav and the `Open provider` action both scroll rather than
   * navigate — this is one page, and a hash change that re-renders it would
   * throw away the status the admin is looking at.
   *
   * `providerAnchorId` is the contract between the attention item and the
   * provider row: the item knows a provider id, the row registers under it.
   */
  const scrollToId = useCallback((id) => {
    if (typeof document === 'undefined') return;
    // Optional all the way down: jsdom does not implement `scrollIntoView`,
    // and a page that cannot scroll is not a page that should throw.
    document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, []);

  const openProvider = useCallback((provider) => {
    scrollToId(providerAnchorId(provider));
  }, [scrollToId]);

  // ── Selectors ────────────────────────────────────────────────────────────

  /**
   * The alive rows split the one way the picker offers them: free first, then
   * the governed paid fallback. Free/paid is the only grouping that changes
   * what a pick *costs*, and it is the only one this list can answer for —
   * the rows carry `fitness` and `paid`, not names or capability matrices.
   */
  const aliveGroups = useMemo(() => {
    const free = [];
    const paid = [];
    for (const row of state.aliveModels) (row.paid ? paid : free).push(row);
    const byFitness = (a, b) => {
      // `structured` first: every AI feature in the suite asks for structured
      // output, so those are the rows a pin should reach for.
      const rank = (row) => (row.fitness === 'structured' ? 0 : 1);
      return rank(a) - rank(b)
        || (a.provider || '').localeCompare(b.provider || '')
        || (a.modelId || '').localeCompare(b.modelId || '');
    };
    return [
      { key: 'free', label: 'Free', rows: free.sort(byFitness) },
      { key: 'paid', label: 'Paid fallback', rows: paid.sort(byFitness) },
    ].filter(group => group.rows.length > 0);
  }, [state.aliveModels]);

  /**
   * The Apps and keys roster: one group per normalized app id, from four
   * sources that each know something the others don't.
   *
   * - **API keys** are the authority on identity. aiGeek resolves the caller
   *   from the key's `appName`, so a key is what makes an app real.
   * - **Routing rows** say where that app's calls go. A row can exist with no
   *   key — `startgeek` calls in-process and never presents one.
   * - **Discovered apps** are names seen in traffic with neither of the above
   *   yet, kept so the admin can start a row from one tap.
   * - **`status.apps`** adds what only the ledger knows: whether the app has
   *   been seen in traffic lately, and when it last called.
   *
   * Ordering: apps with keys first (those are the ones being administered),
   * then alphabetical inside each half.
   */
  const appGroups = useMemo(() => {
    const groups = new Map();
    const ensure = (appId) => {
      if (!groups.has(appId)) {
        groups.set(appId, { appId, config: null, keys: [], discovered: false, status: null });
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
    for (const row of state.status?.apps || []) {
      ensure(normalizeAppId(row.app)).status = row;
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
  }, [state.appConfigs, state.apiKeys, state.discoveredApps, state.status]);

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

  /**
   * The catalog as a flat, read-only table: one row per model the catalog
   * holds, with what `/models/alive` knows about it layered on.
   *
   * Two sources because neither answers the whole question. `aiDirectorModels`
   * lists every model, alive or not, with its free-tier ceilings;
   * `/models/alive` says which rows answer *right now* and how well
   * (`fitness`), which is the column an admin actually reads. A model in the
   * catalog and not in the alive list is cooling or unkeyed — which is
   * information, so it stays in the table rather than being filtered out.
   */
  const catalogRows = useMemo(() => {
    const aliveBy = new Map(
      state.aliveModels.map(row => [`${row.provider}::${row.modelId}`, row])
    );
    const rows = [];
    for (const [provider, entry] of Object.entries(state.directorData?.providers || {})) {
      for (const model of entry.models || []) {
        const alive = aliveBy.get(`${provider}::${model.id}`) || null;
        rows.push({
          key: `${provider}::${model.id}`,
          provider,
          modelId: model.id,
          name: model.name,
          isFree: model.freeTier?.isFree === true,
          // The director read carries the whole AIFreeTier row now, so a
          // cooling model still shows its fitness and the live quota reading —
          // the alive list only knows the rows that answer right now.
          fitness: model.freeTier?.fitness ?? alive?.fitness ?? null,
          observed: model.freeTier?.observed ?? null,
          health: model.freeTier?.health ?? null,
          override: model.freeTier?.override ?? null,
          alive: !!alive,
          paid: alive?.paid === true,
          lastSuccessAt: alive?.lastSuccessAt ?? model.freeTier?.health?.lastSuccessAt ?? null,
          limits: model.freeTier?.limits || {},
          hasKey: entry.hasApiKey === true,
        });
      }
    }
    return rows.sort((a, b) =>
      a.provider.localeCompare(b.provider) || a.modelId.localeCompare(b.modelId));
  }, [state.directorData, state.aliveModels]);

  /** Which providers the roster holds, in the order the server sent them. */
  const providerIds = useMemo(() => Object.keys(state.config), [state.config]);

  return {
    state,
    dispatch,
    // fetches
    loadStatus,
    loadAliveModels,
    loadConfiguration,
    loadStatistics,
    loadDirectorData,
    loadAppConfigs,
    loadApiKeys,
    // providers
    setConfigField,
    saveProviderKey,
    removeProviderKey,
    // usage
    resetStatistics,
    // needs attention
    runDiscovery,
    openProvider,
    scrollToId,
    // app routing
    saveAppConfig,
    patchAppConfig,
    deleteAppConfig,
    setCatalogOverride,
    addDiscoveredApp,
    editAppConfig,
    // api keys
    openCreateKey,
    openEditKey,
    patchKey,
    patchKeyRate,
    closeKeyDialog,
    saveApiKey,
    revokeApiKey,
    copyText,
    // suggest
    toggleSuggest,
    runRecommendation,
    // selectors
    aliveGroups,
    appGroups,
    unattributedUsage,
    catalogRows,
    providerIds,
  };
}

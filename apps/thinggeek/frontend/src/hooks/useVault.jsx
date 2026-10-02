/**
 * The Attic's lock, as the app sees it. The SERVER decides (a vault session
 * in an HttpOnly cookie, 10 min idle / 60 min absolute); this mirrors its
 * answer, counts down to the idle deadline it reports, tells it about
 * activity (a ping at most every 30 s while someone is using the Attic),
 * and locks — server first — when the countdown runs out, on Lock, or when
 * any call answers VAULT_LOCKED.
 *
 * Locking also evicts every Attic answer from the Apollo cache, so titles
 * and people don't linger in memory after the door shuts.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useApolloClient } from '@apollo/client';
import * as atticApi from '../api/attic';
import { ATTIC_ROOT_FIELDS } from '../graphql/attic';

const VaultContext = createContext(null);

const PING_EVERY_MS = 30 * 1000;
const UNKNOWN = { loading: true, available: true, setUp: false, pin: false, passkeys: [], unlocked: false, idleExpiresAt: null, expiresAt: null, pinRetryAt: null };

/** For tests and the harness: a fixed state (no network). */
export function StaticVaultProvider({ value, children }) {
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function VaultProvider({ children, api = atticApi }) {
  const client = useApolloClient();
  const [status, setStatus] = useState(UNKNOWN);
  const [error, setError] = useState(null);
  const lastPing = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  const evictAttic = useCallback(() => {
    try {
      ATTIC_ROOT_FIELDS.forEach((fieldName) => client.cache.evict({ id: 'ROOT_QUERY', fieldName }));
      client.cache.gc();
    } catch {
      // A cache without these fields is already clean.
    }
  }, [client]);

  const apply = useCallback((s) => {
    if (!s || typeof s !== 'object') return;
    setStatus({ ...UNKNOWN, ...s, loading: false });
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.vaultStatus());
    } catch (err) {
      if (err?.code === 'ATTIC_UNAVAILABLE' || err?.status === 503) setStatus({ ...UNKNOWN, loading: false, available: false });
      else {
        setStatus((s) => ({ ...s, loading: false }));
        setError(err);
      }
    }
  }, [api, apply]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Back from another app: the server may have locked while we were away.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  /** The server said VAULT_LOCKED (or the countdown ran out): show the door. */
  const markLocked = useCallback(() => {
    evictAttic();
    setStatus((s) => ({ ...s, unlocked: false, idleExpiresAt: null, expiresAt: null, method: null }));
  }, [evictAttic]);

  const lock = useCallback(async () => {
    markLocked();
    try {
      await api.lockVault();
    } catch {
      // The door is shut on this side either way; the session dies on its own deadline.
    }
  }, [api, markLocked]);

  const run = useCallback(
    async (fn) => {
      const s = await fn();
      apply(s);
      return s;
    },
    [apply]
  );

  const actions = useMemo(
    () => ({
      refresh,
      lock,
      markLocked,
      unlockWithPin: (pin) => run(() => api.unlockWithPin(pin)),
      unlockWithPasskey: () => run(() => api.unlockWithPasskey()),
      setPin: (pin) => run(() => api.setPin(pin)),
      registerPasskey: (label) => run(() => api.registerPasskey(label)),
      removePasskey: (id) => run(() => api.removePasskey(id)),
      /** Someone is using the Attic: tell the server, at most every 30 s. */
      activity: () => {
        if (!statusRef.current.unlocked) return;
        const t = Date.now();
        if (t - lastPing.current < PING_EVERY_MS) return;
        lastPing.current = t;
        api.pingVault().then(apply, (err) => {
          if (atticApi.isVaultLocked(err)) markLocked();
        });
      },
      /** Wrap any Attic call's error: a VAULT_LOCKED answer shuts the door. */
      handleError: (err) => {
        if (atticApi.isVaultLocked(err)) markLocked();
      },
    }),
    [api, apply, lock, markLocked, refresh, run]
  );

  // Auto-lock at the server's idle deadline (it would refuse us anyway).
  useEffect(() => {
    if (!status.unlocked || !status.idleExpiresAt) return undefined;
    const ms = new Date(status.idleExpiresAt).getTime() - Date.now();
    const timer = setTimeout(() => lock(), Math.max(0, ms));
    return () => clearTimeout(timer);
  }, [status.unlocked, status.idleExpiresAt, lock]);

  const value = useMemo(() => ({ ...status, error, passkeysSupported: atticApi.passkeysSupported(), ...actions }), [status, error, actions]);
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

/** The lock's state and actions. `optional`: outside a provider, answer "locked" instead of throwing. */
export function useVault({ optional = false } = {}) {
  const v = useContext(VaultContext);
  if (!v && optional) return LOCKED_FALLBACK;
  if (!v) throw new Error('useVault outside a VaultProvider');
  return v;
}

const noop = () => {};
const LOCKED_FALLBACK = Object.freeze({ ...UNKNOWN, loading: false, unlocked: false, activity: noop, handleError: noop, markLocked: noop, lock: noop, refresh: noop });

/** A query's error → shut the door if it was VAULT_LOCKED (an effect, not Apollo's onError). */
export function useLockOnError(error) {
  const vault = useVault({ optional: true });
  const { handleError } = vault;
  useEffect(() => {
    if (error) handleError(error);
  }, [error, handleError]);
}

/** Whole seconds until `iso` (never negative), re-rendered every second. */
export function useCountdown(iso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [iso]);
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - now) / 1000));
}

export function formatCountdown(seconds) {
  if (seconds == null) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

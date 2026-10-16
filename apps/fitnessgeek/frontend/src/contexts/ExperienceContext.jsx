import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@geeksuite/auth';
import { localDateString } from '@geeksuite/utils';
import { experienceService } from '../services/experienceService.js';
import { decideMode, hasRecentActivity, isExperienceMode, userKeyOf } from '../utils/experience.js';
import logger from '../utils/logger.js';
import { displayNameFrom } from '../components/Layout/userDisplay.js';

/**
 * Simple and Full, per person (DOCS/SIMPLE_AND_FULL_PLAN.md).
 *
 * Holds the person's `experience` settings — Simple or Full, Larger text, the
 * first-run answers — and the mode they actually see: what they chose, or,
 * when they never chose, the default read off their own history
 * (utils/experience.js). Stored on the settings document; written partially.
 *
 * A derived mode is SAVED the first time it is worked out (review B4), so a
 * person's face never flips by itself: before, an unsaved Simple person who
 * logged one breakfast was Full on the next load. A saved mode is never
 * touched here.
 *
 * A failed read is not "never chose" (review B5). The last known answer
 * stays, the cache is left alone, the first run stays hidden, and the read
 * is tried again when the app comes back online or to the foreground.
 *
 * Larger text is applied here, to the document root, so every rem-sized thing
 * in the app grows together (index.css, `data-text-size`).
 *
 * The last known answer is kept in localStorage, per person, as a per-browser
 * convenience so a reload paints the right face before the network answers.
 * It is never the source of truth; every read of it is wrapped, because
 * private windows and blocked site data throw. The old unkeyed cache can't
 * say whose it was (a dead account's answer once painted first), so it is
 * dropped, not read.
 */
const LEGACY_CACHE_KEY = 'fg.experience.v1';
const cacheKeyFor = (userKey) => `${LEGACY_CACHE_KEY}.${userKey}`;

const dropLegacyCache = () => {
  try {
    window.localStorage.removeItem(LEGACY_CACHE_KEY);
  } catch {
    // Convenience only.
  }
};
const readCache = (userKey) => {
  if (!userKey) return null;
  try {
    const raw = window.localStorage.getItem(cacheKeyFor(userKey));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeCache = (userKey, value) => {
  if (!userKey) return;
  try {
    window.localStorage.setItem(cacheKeyFor(userKey), JSON.stringify(value));
  } catch {
    // Convenience only.
  }
};

export const ExperienceContext = createContext(null);

const DEFAULTS = {
  mode: null,
  larger_text: false,
  first_run_done: false,
  preferred_name: null,
  goal: null,
};

function applyTextSize(larger) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.textSize = larger ? 'larger' : 'normal';
}

export const ExperienceProvider = ({ children, today: todayProp }) => {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const userKey = userKeyOf(user);
  const [saved, setSavedState] = useState(DEFAULTS);
  const savedRef = useRef(saved);
  const setSaved = useCallback((next) => { savedRef.current = next; setSavedState(next); }, []);
  const [derivedMode, setDerivedMode] = useState(null);
  const derivedRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Whose cache is painted. Swapped during render (not in an effect) so a
  // different person never sees one frame of the last person's face.
  const [paintedFor, setPaintedFor] = useState(null);
  // A derived mode is saved once per person per session, not on every load.
  const derivedSavedFor = useRef(new Set());

  useEffect(() => { dropLegacyCache(); }, []);

  if (userKey !== paintedFor) {
    const cached = readCache(userKey);
    const next = { ...DEFAULTS, ...(cached?.saved || {}) };
    savedRef.current = next;
    derivedRef.current = cached?.derivedMode ?? null;
    setPaintedFor(userKey);
    setSavedState(next);
    setDerivedMode(cached?.derivedMode ?? null);
    setReadFailed(false);
  }

  const today = todayProp || localDateString();

  useEffect(() => {
    if (authLoading) return undefined;
    if (!isAuthenticated) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      let experience = null;
      try {
        experience = await experienceService.get();
      } catch (err) {
        // Offline, a deploy restart, a weak signal: we don't know. Keep what
        // we had and ask again later — never "never chose".
        logger.debug('Experience settings unavailable', err?.message);
        if (cancelled) return;
        setReadFailed(true);
        setLoading(false);
        return;
      }
      let next = { ...DEFAULTS, ...(experience || {}) };
      let derived = null;
      let answered = false;
      if (!isExperienceMode(next.mode)) {
        try {
          const activity = await experienceService.activity((a) => hasRecentActivity(a, today));
          derived = decideMode({ savedMode: null, activity, today });
          answered = true;
        } catch {
          // The history couldn't be read: the last answer, else Simple —
          // shown, but not saved, because it isn't really an answer.
          derived = derivedRef.current || 'simple';
        }
      }
      if (cancelled) return;
      setReadFailed(false);
      setSaved(next);
      derivedRef.current = derived;
      setDerivedMode(derived);
      writeCache(userKey, { saved: next, derivedMode: derived });
      setLoading(false);

      if (answered && userKey && !derivedSavedFor.current.has(userKey)) {
        derivedSavedFor.current.add(userKey);
        try {
          await experienceService.update({ mode: derived });
          if (cancelled) return;
          next = { ...savedRef.current, mode: isExperienceMode(savedRef.current.mode) ? savedRef.current.mode : derived };
          setSaved(next);
          writeCache(userKey, { saved: next, derivedMode: derived });
        } catch (err) {
          // Still derived; the next load works it out and tries again.
          derivedSavedFor.current.delete(userKey);
          logger.debug('Could not save the derived mode', err?.message);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, userKey, today, attempt, setSaved]);

  // After a failed read, try again when there is reason to think it'll work.
  useEffect(() => {
    if (!readFailed) return undefined;
    const retry = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setAttempt((n) => n + 1);
    };
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', retry);
    return () => {
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', retry);
    };
  }, [readFailed]);

  useEffect(() => { applyTextSize(saved.larger_text); }, [saved.larger_text]);

  /** Optimistic partial write; rolls back and reports on failure. */
  const update = useCallback(async (patch) => {
    const before = savedRef.current;
    const next = { ...before, ...patch };
    setSaved(next);
    writeCache(userKey, { saved: next, derivedMode });
    try {
      await experienceService.update(patch);
      return { ok: true };
    } catch (error) {
      logger.error('Could not save experience settings', error?.message);
      setSaved(before);
      writeCache(userKey, { saved: before, derivedMode });
      return { ok: false, error };
    }
  }, [derivedMode, setSaved, userKey]);

  const effectiveMode = isExperienceMode(saved.mode) ? saved.mode : (derivedMode || 'full');

  const value = useMemo(() => ({
    loading,
    // False while the saved settings couldn't be read: show nothing that
    // depends on "never chose" (the first run).
    known: !readFailed,
    savedMode: isExperienceMode(saved.mode) ? saved.mode : null,
    effectiveMode,
    isSimple: effectiveMode === 'simple',
    largerText: Boolean(saved.larger_text),
    firstRunDone: Boolean(saved.first_run_done),
    preferredName: saved.preferred_name || null,
    // What to call them: their own answer, else the account's first name.
    displayName: saved.preferred_name || (user ? displayNameFrom(user) : null),
    goal: saved.goal || null,
    setMode: (mode) => update({ mode }),
    setLargerText: (on) => update({ larger_text: Boolean(on) }),
    // Finishing the first run also SAVES Simple. The default rule is "Full if
    // they logged anything in 90 days" — left unsaved, Heather's first
    // breakfast would flip her into Full on the next load.
    completeFirstRun: (answers = {}) => update({ ...answers, first_run_done: true, mode: 'simple' }),
    update,
  }), [loading, readFailed, saved, effectiveMode, update, user]);

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
};

/**
 * Outside a provider (a unit test mounting one component) this answers
 * "Full, normal text, nothing pending" rather than throwing, so every
 * existing component test keeps rendering the face it was written against.
 */
const FALLBACK = {
  loading: false,
  known: true,
  savedMode: null,
  effectiveMode: 'full',
  isSimple: false,
  largerText: false,
  firstRunDone: true,
  preferredName: null,
  displayName: null,
  goal: null,
  setMode: async () => ({ ok: false }),
  setLargerText: async () => ({ ok: false }),
  completeFirstRun: async () => ({ ok: false }),
  update: async () => ({ ok: false }),
};

export const useExperience = () => useContext(ExperienceContext) || FALLBACK;

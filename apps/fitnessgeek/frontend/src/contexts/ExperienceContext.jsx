import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@geeksuite/auth';
import { localDateString } from '@geeksuite/utils';
import { experienceService } from '../services/experienceService.js';
import { decideMode, hasRecentActivity, isExperienceMode } from '../utils/experience.js';
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
 * Larger text is applied here, to the document root, so every rem-sized thing
 * in the app grows together (index.css, `data-text-size`).
 *
 * The last known answer is kept in localStorage as a per-browser convenience
 * so a reload paints the right face before the network answers. It is never
 * the source of truth; every read of it is wrapped, because private windows
 * and blocked site data throw.
 */
const CACHE_KEY = 'fg.experience.v1';

const readCache = () => {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeCache = (value) => {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
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
  const cached = useMemo(() => readCache(), []);
  const [saved, setSavedState] = useState(() => ({ ...DEFAULTS, ...(cached?.saved || {}) }));
  const savedRef = useRef(saved);
  const setSaved = useCallback((next) => { savedRef.current = next; setSavedState(next); }, []);
  const [derivedMode, setDerivedMode] = useState(cached?.derivedMode ?? null);
  const [loading, setLoading] = useState(true);

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
        // An older gateway without the field: treat as "never chose".
        logger.debug('Experience settings unavailable', err?.message);
      }
      const next = { ...DEFAULTS, ...(experience || {}) };
      let derived = null;
      if (!isExperienceMode(next.mode)) {
        try {
          const activity = await experienceService.activity((a) => hasRecentActivity(a, today));
          derived = decideMode({ savedMode: null, activity, today });
        } catch {
          // Nothing to go on is "hasn't logged": Simple.
          derived = 'simple';
        }
      }
      if (cancelled) return;
      setSaved(next);
      setDerivedMode(derived);
      writeCache({ saved: next, derivedMode: derived });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, isAuthenticated, today, setSaved]);

  useEffect(() => { applyTextSize(saved.larger_text); }, [saved.larger_text]);

  /** Optimistic partial write; rolls back and reports on failure. */
  const update = useCallback(async (patch) => {
    const before = savedRef.current;
    const next = { ...before, ...patch };
    setSaved(next);
    writeCache({ saved: next, derivedMode });
    try {
      await experienceService.update(patch);
      return { ok: true };
    } catch (error) {
      logger.error('Could not save experience settings', error?.message);
      setSaved(before);
      writeCache({ saved: before, derivedMode });
      return { ok: false, error };
    }
  }, [derivedMode, setSaved]);

  const effectiveMode = isExperienceMode(saved.mode) ? saved.mode : (derivedMode || 'full');

  const value = useMemo(() => ({
    loading,
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
  }), [loading, saved, effectiveMode, update, user]);

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
};

/**
 * Outside a provider (a unit test mounting one component) this answers
 * "Full, normal text, nothing pending" rather than throwing, so every
 * existing component test keeps rendering the face it was written against.
 */
const FALLBACK = {
  loading: false,
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

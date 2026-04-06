import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';

// ─── Internal state ───
let _state = {
  identity: null,
  profile: null,
  preferences: null,
  appPreferences: {},
  loaded: false,
  loading: false,
  error: null,
};
let _listeners = new Set();
let _apiInstance = null;

function notify() {
  _listeners.forEach(fn => fn({ ..._state }));
}

function setState(patch) {
  _state = { ..._state, ...patch };
  notify();
}

// ─── Core actions ───

async function bootstrap() {
  if (!_apiInstance) throw new Error('@geeksuite/user: no api instance configured. Call configure() first.');
  setState({ loading: true, error: null });
  try {
    const res = await _apiInstance.get('/users/bootstrap');
    setState({
      identity: res.data.identity,
      profile: res.data.profile,
      preferences: res.data.preferences,
      appPreferences: res.data.appPreferences || {},
      loaded: true,
      loading: false,
    });
    return res.data;
  } catch (err) {
    setState({ loading: false, error: err.response?.data?.message || err.message });
    throw err;
  }
}

async function updateProfile(fields) {
  if (!_apiInstance) throw new Error('@geeksuite/user: not configured');
  const res = await _apiInstance.patch('/users/profile', fields);
  setState({
    identity: res.data.identity || _state.identity,
    profile: res.data.profile,
  });
  return res.data;
}

async function updatePreferences(fields) {
  if (!_apiInstance) throw new Error('@geeksuite/user: not configured');
  const res = await _apiInstance.patch('/users/preferences', fields);
  setState({ preferences: res.data.preferences });
  return res.data;
}

async function updateAppPreferences(appName, fields) {
  if (!_apiInstance) throw new Error('@geeksuite/user: not configured');
  const res = await _apiInstance.patch(`/users/preferences/${appName}`, fields);
  setState({
    appPreferences: {
      ..._state.appPreferences,
      [appName]: res.data.preferences,
    },
  });
  return res.data;
}

function reset() {
  _state = {
    identity: null,
    profile: null,
    preferences: null,
    appPreferences: {},
    loaded: false,
    loading: false,
    error: null,
  };
  notify();
}

// ─── Configuration ───

export function configure(apiInstance) {
  _apiInstance = apiInstance;
}

// ─── React hooks ───

export function useUser() {
  const [state, set] = useState({ ..._state });
  useEffect(() => {
    const handler = (s) => set(s);
    _listeners.add(handler);
    return () => _listeners.delete(handler);
  }, []);

  return {
    ...state,
    bootstrap,
    updateProfile,
    updatePreferences,
    updateAppPreferences,
    reset,
  };
}

export function usePreferences() {
  const { preferences, updatePreferences: update, loaded, loading } = useUser();
  return { preferences, updatePreferences: update, loaded, loading };
}

export function useAppPreferences(appName) {
  const { appPreferences, updateAppPreferences, loaded, loading } = useUser();
  const prefs = appPreferences?.[appName] || {};
  const update = useCallback(
    (fields) => updateAppPreferences(appName, fields),
    [appName]
  );
  return { preferences: prefs, updateAppPreferences: update, loaded, loading };
}

export function useProfile() {
  const { identity, profile, updateProfile: update, loaded, loading } = useUser();
  return { identity, profile, updateProfile: update, loaded, loading };
}

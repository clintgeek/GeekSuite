import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const FocusModeContext = createContext({
  focusMode: false,
  setFocusMode: () => {},
  toggleFocusMode: () => {},
});

function readStoredPreference(storageKey, defaultValue) {
  if (!storageKey || typeof window === 'undefined') return defaultValue;

  try {
    const value = window.localStorage.getItem(storageKey);
    if (value === 'true') return true;
    if (value === 'false') return false;
  } catch {
    return defaultValue;
  }

  return defaultValue;
}

function writeStoredPreference(storageKey, value) {
  if (!storageKey || typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Focus mode is still useful without persistence.
  }
}

export function FocusModeProvider({
  children,
  defaultFocusMode = false,
  storageKey,
}) {
  const [focusMode, setFocusMode] = useState(() =>
    readStoredPreference(storageKey, defaultFocusMode)
  );

  useEffect(() => {
    writeStoredPreference(storageKey, focusMode);
  }, [focusMode, storageKey]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.focusMode = focusMode ? 'true' : 'false';
  }, [focusMode]);

  const toggleFocusMode = useCallback(() => {
    setFocusMode((current) => !current);
  }, []);

  const value = useMemo(
    () => ({ focusMode, setFocusMode, toggleFocusMode }),
    [focusMode, toggleFocusMode]
  );

  return (
    <FocusModeContext.Provider value={value}>
      {children}
    </FocusModeContext.Provider>
  );
}

export function useFocusMode() {
  return useContext(FocusModeContext);
}


/* eslint-disable react-refresh/only-export-components -- a provider and its hooks belong together */
/**
 * LampTest — the Konami code runs the panel's lamp test.
 *
 * Real annunciator panels have a LAMP TEST button that lights every bulb for
 * a few seconds so you can see none has blown. Here it is ↑ ↑ ↓ ↓ ← → ← → B A
 * (anywhere in the console, not while typing in a field). Every lamp cycles
 * through its colours for three seconds, a banner says so, and then the panel
 * goes back to its real readings — which it never stopped showing in words:
 * the lamp test only changes the glass, never the text beside it.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { ringBell } from './sound';

const LampTestContext = createContext(false);

export const KONAMI = Object.freeze([
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]);

export const LAMP_TEST_MS = 3000;

/**
 * Feed keys in, get `true` back on the key that completes the sequence.
 * Pure, so the matcher is testable without a keyboard.
 */
export function konamiStep(progress, key) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === KONAMI[progress]) {
    const next = progress + 1;
    return next === KONAMI.length ? { progress: 0, done: true } : { progress: next, done: false };
  }
  return { progress: k === KONAMI[0] ? 1 : 0, done: false };
}

const isTyping = (target) => {
  const tag = target?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable;
};

export function LampTestProvider({ children }) {
  const [active, setActive] = useState(false);
  const progress = useRef(0);
  const timer = useRef(null);

  const run = useCallback(() => {
    clearTimeout(timer.current);
    setActive(true);
    ringBell({ strikes: 2 });
    timer.current = setTimeout(() => setActive(false), LAMP_TEST_MS);
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (isTyping(event.target)) return;
      const step = konamiStep(progress.current, event.key);
      progress.current = step.progress;
      if (step.done) run();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(timer.current);
    };
  }, [run]);

  return (
    <LampTestContext.Provider value={active}>
      {children}
      <Box
        role="status"
        aria-live="polite"
        sx={{
          position: 'fixed',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          zIndex: 1500,
          pointerEvents: 'none',
          ...(active
            ? {
              px: 2,
              py: 1,
              borderRadius: 1,
              bgcolor: 'box.tape.black',
              color: 'box.tape.ink',
              fontFamily: 'fontFamilyMono',
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontSize: '0.8125rem',
              boxShadow: 6,
            }
            : { width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' }),
        }}
      >
        {active ? 'Lamp test — every bulb lit' : ''}
      </Box>
    </LampTestContext.Provider>
  );
}

export function useLampTest() {
  return useContext(LampTestContext);
}

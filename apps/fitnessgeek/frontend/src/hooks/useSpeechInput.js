import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Speak it (DOCS/SIMPLE_AND_FULL_PLAN.md item 3): the Web Speech API's
 * recognizer, as a hook.
 *
 * `SpeechRecognition` is standard in name only — Chrome (Android included,
 * which is the phone this is for) ships it as `webkitSpeechRecognition`,
 * Safari as either, Firefox not at all. So: feature-detect, and when there is
 * nothing to detect the caller hides its button rather than offering a
 * microphone that cannot work.
 *
 * One utterance per tap (`continuous = false`): say "two eggs and toast",
 * pause, and it is done. The final transcript goes to `onFinal`, which is
 * where the caller hands it to describe-and-log — the same path typing takes.
 *
 * Errors come back as a plain reason, never the recognizer's codes:
 *   'denied'   — the person (or the browser) refused the microphone
 *   'no-speech' — it listened and heard nothing
 *   'other'    — anything else (network, aborted, no microphone)
 */

export function getSpeechRecognition(win = typeof window !== 'undefined' ? window : undefined) {
  return win?.SpeechRecognition || win?.webkitSpeechRecognition || null;
}

const reasonFor = (code) => {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'denied';
  if (code === 'no-speech') return 'no-speech';
  return 'other';
};

export const SPEECH_ERROR_TEXT = {
  denied: 'FitnessGeek needs your microphone to hear you. Allow it in your browser settings, or type instead.',
  'no-speech': "I didn't hear anything. Tap the microphone and try again.",
  other: "The microphone isn't working right now. You can type instead.",
};

export function useSpeechInput({ onFinal, lang = 'en-US' } = {}) {
  const Recognition = useMemo(() => getSpeechRecognition(), []);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const finalRef = useRef('');
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      // Already stopped.
    }
  }, []);

  const start = useCallback(() => {
    if (!Recognition || recRef.current) return;
    setError(null);
    setInterim('');
    finalRef.current = '';

    let rec;
    try {
      rec = new Recognition();
    } catch {
      setError('other');
      return;
    }
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let heard = '';
      for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript || '';
        if (result.isFinal) finalRef.current += text;
        else heard += text;
      }
      setInterim(`${finalRef.current}${heard}`.trim());
    };
    rec.onerror = (event) => setError(reasonFor(event?.error));
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const text = finalRef.current.trim();
      finalRef.current = '';
      if (text) onFinalRef.current?.(text);
    };

    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      recRef.current = null;
      setError('other');
    }
  }, [Recognition, lang]);

  // Leaving the screen mid-sentence must not leave the microphone open.
  useEffect(() => () => {
    try {
      recRef.current?.abort?.();
    } catch {
      // Nothing to release.
    }
  }, []);

  return {
    supported: Boolean(Recognition),
    listening,
    interim,
    error,
    errorText: error ? SPEECH_ERROR_TEXT[error] : null,
    start,
    stop,
    clearError: () => setError(null),
  };
}

export default useSpeechInput;

/**
 * sound — the box bell and the lever clunk, synthesised. No audio files.
 *
 * Silent unless the Sound switch in Settings is on (it is off by default).
 * Every call is fire-and-forget and swallows its own failure: a browser that
 * refuses an AudioContext gets a silent console, not an error.
 */
import { getConsolePrefs } from './consolePrefs';

let ctx = null;

function audio() {
  if (!getConsolePrefs().sound) return null;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** One strike of the block bell: a bright partial over a slow decay. */
export function ringBell({ strikes = 1, force = false } = {}) {
  const a = force ? forcedAudio() : audio();
  if (!a) return;
  try {
    for (let i = 0; i < strikes; i += 1) {
      const t = a.currentTime + i * 0.28;
      for (const [freq, gain] of [[1318, 0.16], [2637, 0.05], [3951, 0.02]]) {
        const osc = a.createOscillator();
        const amp = a.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        amp.gain.setValueAtTime(gain, t);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        osc.connect(amp).connect(a.destination);
        osc.start(t);
        osc.stop(t + 1.25);
      }
    }
  } catch {
    // ignore
  }
}

/** The lever: a short low thud with a noisy edge. */
export function clunk() {
  const a = audio();
  if (!a) return;
  try {
    const t = a.currentTime;
    const osc = a.createOscillator();
    const amp = a.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    amp.gain.setValueAtTime(0.25, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(amp).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch {
    // ignore
  }
}

/** For the Settings "test the bell" button, which is itself a user gesture. */
function forcedAudio() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

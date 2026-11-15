/**
 * transcriptCorrections.js — corrections made in Convert survive the next
 * reading (review 2.11).
 *
 * A correction was kept for the sketch's exact content only: one more stroke
 * and Convert's next reading came back with "Bbo" again. Now the line pairs a
 * writer fixed are remembered on this device, per sketch, and a new reading
 * gets each fix back wherever the model read that line the same way again
 * (a line diff — lines that changed on the page are left as read).
 *
 * Kept in localStorage: the note's own words, on the writer's own device.
 */
const KEY = 'notegeek:sketchCorrections';
const MAX_NOTES = 30;
const MAX_PAIRS = 200;

const lines = (t) => String(t ?? '').replace(/\r\n?/g, '\n').split('\n');

/** [[from, to]] line pairs the writer changed, by a line diff (LCS) of the two. */
export function correctionPairs(original, corrected) {
  const a = lines(original);
  const b = lines(corrected);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  let runA = [];
  let runB = [];
  const closeRun = () => {
    // A run of changed lines, the same number on each side: line i became line i.
    if (runA.length && runA.length === runB.length) {
      runA.forEach((from, k) => { if (from.trim() && from !== runB[k]) pairs.push([from, runB[k]]); });
    }
    runA = [];
    runB = [];
  };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { closeRun(); i += 1; j += 1; } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { runB.push(b[j]); j += 1; } else { runA.push(a[i]); i += 1; }
  }
  closeRun();
  return pairs;
}

/** A new reading with the remembered fixes put back on lines read the same way. */
export function applyCorrectionPairs(text, pairs = []) {
  if (!pairs.length) return text;
  const fix = new Map(pairs.map(([from, to]) => [from.trim(), to]));
  return lines(text).map((l) => (fix.has(l.trim()) ? fix.get(l.trim()) : l)).join('\n');
}

function readAll(storage) {
  try {
    const v = JSON.parse(storage?.getItem(KEY) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

/** Remember what the writer fixed in a reading of this sketch. */
export function rememberCorrections(noteId, original, corrected, storage = globalThis.localStorage) {
  if (!noteId || !original || !corrected || original === corrected) return;
  const all = readAll(storage);
  const old = all[noteId]?.pairs || [];
  const fresh = correctionPairs(original, corrected);
  if (!fresh.length) return;
  const byFrom = new Map(old.map((p) => [p[0], p]));
  fresh.forEach((p) => byFrom.set(p[0], p));
  all[noteId] = { pairs: [...byFrom.values()].slice(-MAX_PAIRS), at: Date.now() };
  const ids = Object.keys(all).sort((x, y) => (all[x].at || 0) - (all[y].at || 0));
  ids.slice(0, Math.max(0, ids.length - MAX_NOTES)).forEach((id) => delete all[id]);
  try {
    storage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage refused: corrections simply aren't carried
  }
}

/** A fresh reading of this sketch, with this device's earlier corrections carried forward. */
export function carryCorrections(noteId, text, storage = globalThis.localStorage) {
  if (!noteId || typeof text !== 'string') return text;
  return applyCorrectionPairs(text, readAll(storage)[noteId]?.pairs || []);
}
